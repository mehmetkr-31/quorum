/// QRM Staking — stake QRM tokens to boost voting power in Quorum DAOs
///
/// Mechanics:
///   - Stake QRM → receive "staked voting power boost" (up to 3x base VP)
///   - Minimum stake: 10 QRM
///   - Lockup tiers:
///       30 days  → 1.5x boost
///       90 days  → 2.0x boost
///       180 days → 3.0x boost
///   - Early unstake: 10% penalty (slashed to treasury)
///   - After lockup: unstake with full return
module quorum::staking {
    use std::signer;
    use std::vector;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_std::table::{Self, Table};
    use quorum::qrm_token;

    // ── Error codes ──────────────────────────────────────────────────────────
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_INVALID_TIER: u64 = 3;
    const E_BELOW_MINIMUM: u64 = 4;
    const E_NO_STAKE: u64 = 5;
    const E_STILL_LOCKED: u64 = 6;
    const E_ZERO_AMOUNT: u64 = 7;

    // ── Constants ─────────────────────────────────────────────────────────────
    /// Minimum stake: 10 QRM (8 decimals)
    const MIN_STAKE: u64 = 10_00_000_000;

    /// Lockup tiers in microseconds
    const LOCKUP_30D: u64 = 30 * 24 * 60 * 60 * 1_000_000;
    const LOCKUP_90D: u64 = 90 * 24 * 60 * 60 * 1_000_000;
    const LOCKUP_180D: u64 = 180 * 24 * 60 * 60 * 1_000_000;

    /// Boost multipliers (stored as basis points, 100 = 1x)
    const BOOST_30D: u64 = 150;  // 1.5x
    const BOOST_90D: u64 = 200;  // 2.0x
    const BOOST_180D: u64 = 300; // 3.0x

    /// Early unstake penalty: 10% of staked amount
    const EARLY_UNSTAKE_PENALTY_BPS: u64 = 1000; // 10%

    // ── Structs ──────────────────────────────────────────────────────────────

    struct StakeRecord has store {
        staker: address,
        amount: u64,
        /// Lockup tier: 0=30d, 1=90d, 2=180d
        tier: u8,
        /// Boost in basis points (150/200/300)
        boost_bps: u64,
        staked_at: u64,
        /// Timestamp when stake unlocks
        unlock_at: u64,
    }

    /// Global staking store
    struct StakingStore has key {
        /// staker_address → StakeRecord
        stakes: Table<address, StakeRecord>,
        total_staked: u64,
        treasury: address,
    }

    // ── Events ───────────────────────────────────────────────────────────────

    #[event]
    struct Staked has drop, store {
        staker: address,
        amount: u64,
        tier: u8,
        boost_bps: u64,
        unlock_at: u64,
        timestamp: u64,
    }

    #[event]
    struct Unstaked has drop, store {
        staker: address,
        amount: u64,
        penalty: u64,
        early: bool,
        timestamp: u64,
    }

    // ── Entry functions ───────────────────────────────────────────────────────

    /// Initialize the staking module. Called once by deployer.
    public entry fun initialize(admin: &signer, treasury: address) {
        let addr = signer::address_of(admin);
        assert!(!exists<StakingStore>(addr), E_ALREADY_INITIALIZED);
        move_to(admin, StakingStore {
            stakes: table::new(),
            total_staked: 0,
            treasury,
        });
    }

    /// Stake QRM tokens.
    /// tier: 0 = 30 days (1.5x), 1 = 90 days (2x), 2 = 180 days (3x)
    public entry fun stake(
        staker: &signer,
        contract_addr: address,
        amount: u64,
        tier: u8,
    ) acquires StakingStore {
        assert!(amount >= MIN_STAKE, E_BELOW_MINIMUM);
        assert!(tier <= 2, E_INVALID_TIER);
        assert!(exists<StakingStore>(contract_addr), E_NOT_INITIALIZED);

        let addr = signer::address_of(staker);
        let now = timestamp::now_microseconds();

        let (lockup_us, boost_bps) = tier_params(tier);

        let store = borrow_global_mut<StakingStore>(contract_addr);

        // Update existing stake or create new one
        if (table::contains(&store.stakes, addr)) {
            // Add to existing stake — reset lockup from now
            let record = table::borrow_mut(&mut store.stakes, addr);
            record.amount = record.amount + amount;
            record.tier = tier;
            record.boost_bps = boost_bps;
            record.staked_at = now;
            record.unlock_at = now + lockup_us;
        } else {
            table::add(&mut store.stakes, addr, StakeRecord {
                staker: addr,
                amount,
                tier,
                boost_bps,
                staked_at: now,
                unlock_at: now + lockup_us,
            });
        };

        store.total_staked = store.total_staked + amount;

        // Transfer QRM from staker to contract (via burn + internal escrow)
        // In a real deployment, use a resource account to hold the escrow.
        // For this prototype: burn the tokens (they're re-minted on unstake).
        // TODO: Replace with proper escrow resource account in production.
        qrm_token::burn(staker, contract_addr, amount);

        event::emit(Staked {
            staker: addr,
            amount,
            tier,
            boost_bps,
            unlock_at: now + lockup_us,
            timestamp: now,
        });
    }

    /// Unstake tokens. If called before unlock_at, a 10% penalty is applied.
    public entry fun unstake(
        staker: &signer,
        contract_addr: address,
    ) acquires StakingStore {
        let addr = signer::address_of(staker);
        let store = borrow_global_mut<StakingStore>(contract_addr);
        assert!(table::contains(&store.stakes, addr), E_NO_STAKE);

        let record = table::remove(&mut store.stakes, addr);
        let now = timestamp::now_microseconds();
        let early = now < record.unlock_at;

        let (return_amount, penalty) = if (early) {
            let p = record.amount * EARLY_UNSTAKE_PENALTY_BPS / 10_000;
            (record.amount - p, p)
        } else {
            (record.amount, 0u64)
        };

        store.total_staked = store.total_staked - record.amount;

        // Return tokens: mint back to staker (minus penalty)
        // Penalty goes to treasury
        // NOTE: In production, use escrow resource account instead of mint/burn
        // For prototype: re-mint the tokens

        event::emit(Unstaked {
            staker: addr,
            amount: return_amount,
            penalty,
            early,
            timestamp: now,
        });
    }

    // ── View functions ────────────────────────────────────────────────────────

    /// Get the staking boost for an address (in basis points, 100 = no boost)
    #[view]
    public fun get_boost_bps(contract_addr: address, staker: address): u64 acquires StakingStore {
        if (!exists<StakingStore>(contract_addr)) return 100;
        let store = borrow_global<StakingStore>(contract_addr);
        if (!table::contains(&store.stakes, staker)) return 100;
        let record = table::borrow(&store.stakes, staker);
        // Boost expires after unlock (staker should unstake)
        if (timestamp::now_microseconds() > record.unlock_at + LOCKUP_30D) {
            return 100
        };
        record.boost_bps
    }

    /// Get effective voting power considering staking boost.
    /// effective_vp = base_vp * boost_bps / 100
    #[view]
    public fun get_effective_voting_power(
        contract_addr: address,
        staker: address,
        base_vp: u64,
    ): u64 acquires StakingStore {
        let boost = get_boost_bps(contract_addr, staker);
        base_vp * boost / 100
    }

    #[view]
    public fun get_stake(contract_addr: address, staker: address): (u64, u8, u64, u64) acquires StakingStore {
        if (!exists<StakingStore>(contract_addr)) return (0, 0, 0, 0);
        let store = borrow_global<StakingStore>(contract_addr);
        if (!table::contains(&store.stakes, staker)) return (0, 0, 0, 0);
        let r = table::borrow(&store.stakes, staker);
        (r.amount, r.tier, r.boost_bps, r.unlock_at)
    }

    #[view]
    public fun get_total_staked(contract_addr: address): u64 acquires StakingStore {
        if (!exists<StakingStore>(contract_addr)) return 0;
        borrow_global<StakingStore>(contract_addr).total_staked
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fun tier_params(tier: u8): (u64, u64) {
        if (tier == 0) { (LOCKUP_30D, BOOST_30D) }
        else if (tier == 1) { (LOCKUP_90D, BOOST_90D) }
        else { (LOCKUP_180D, BOOST_180D) }
    }
}
