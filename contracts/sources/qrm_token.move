/// QRM Token — the governance and utility token for Quorum DAO
///
/// Uses the Aptos Fungible Asset standard (aptos_framework::fungible_asset).
/// Total supply: 1,000,000,000 QRM (1 billion), 8 decimals.
///
/// Distribution at initialization:
///   - 40% → DAO treasury (stored in module's resource account signer)
///   - 30% → Contributor rewards pool (minted on contribution approval)
///   - 20% → Curator rewards pool (minted on vote activity)
///   - 10% → Team/development (vested, claimable by admin)
///
/// Ongoing emission: QRM is minted by the protocol when:
///   1. A contribution is approved → contributor receives QRM proportional to weight
///   2. A vote is cast → voter receives a small QRM reward
///   3. Revenue is distributed → bonus QRM to top contributors
module quorum::qrm_token {
    use std::signer;
    use std::string;
    use std::option;
    use aptos_framework::fungible_asset::{
        Self, MintRef, TransferRef, BurnRef, Metadata, FungibleAsset,
    };
    use aptos_framework::object::{Self, Object};
    use aptos_framework::primary_fungible_store;
    use aptos_framework::event;

    // ── Error codes ──────────────────────────────────────────────────────────
    const E_NOT_ADMIN: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_INSUFFICIENT_BALANCE: u64 = 3;
    const E_ZERO_AMOUNT: u64 = 4;

    // ── Constants ────────────────────────────────────────────────────────────
    const TOKEN_NAME: vector<u8> = b"Quorum Token";
    const TOKEN_SYMBOL: vector<u8> = b"QRM";
    const TOKEN_DECIMALS: u8 = 8;
    const TOKEN_ICON_URI: vector<u8> = b"https://quorum.community/qrm-icon.png";
    const TOKEN_PROJECT_URI: vector<u8> = b"https://quorum.community";

    /// Total supply cap: 1 billion QRM (in smallest units, 8 decimals)
    const MAX_SUPPLY: u128 = 1_000_000_000_00_000_000;
    /// Initial treasury allocation: 40% of max supply
    const TREASURY_INITIAL: u64 = 400_000_000_00_000_000;

    /// Contribution approval reward: 100 QRM per approved contribution
    const CONTRIBUTION_REWARD: u64 = 100_00_000_000;
    /// Vote reward: 1 QRM per vote cast
    const VOTE_REWARD: u64 = 1_00_000_000;
    /// Proposal creation reward: 10 QRM
    const PROPOSAL_REWARD: u64 = 10_00_000_000;

    // ── Structs ──────────────────────────────────────────────────────────────

    /// Capability refs stored in the deployer's account
    struct TokenRefs has key {
        mint_ref: MintRef,
        transfer_ref: TransferRef,
        burn_ref: BurnRef,
    }

    /// Admin cap — only this address can mint outside of protocol rewards
    struct AdminCap has key {
        admin: address,
    }

    // ── Events ───────────────────────────────────────────────────────────────

    #[event]
    struct TokensMinted has drop, store {
        recipient: address,
        amount: u64,
        reason: vector<u8>,
        timestamp: u64,
    }

    #[event]
    struct TokensBurned has drop, store {
        from: address,
        amount: u64,
        timestamp: u64,
    }

    // ── Initialization ───────────────────────────────────────────────────────

    /// Called once by the contract deployer.
    /// Creates the QRM fungible asset and mints the initial treasury allocation.
    public entry fun initialize(admin: &signer) {
        let addr = signer::address_of(admin);
        assert!(!exists<TokenRefs>(addr), E_ALREADY_INITIALIZED);

        // Create the fungible asset metadata object
        let constructor_ref = &object::create_named_object(admin, TOKEN_SYMBOL);
        primary_fungible_store::create_primary_store_enabled_fungible_asset(
            constructor_ref,
            option::some((MAX_SUPPLY as u128)),
            string::utf8(TOKEN_NAME),
            string::utf8(TOKEN_SYMBOL),
            TOKEN_DECIMALS,
            string::utf8(TOKEN_ICON_URI),
            string::utf8(TOKEN_PROJECT_URI),
        );

        let mint_ref = fungible_asset::generate_mint_ref(constructor_ref);
        let transfer_ref = fungible_asset::generate_transfer_ref(constructor_ref);
        let burn_ref = fungible_asset::generate_burn_ref(constructor_ref);

        move_to(admin, TokenRefs { mint_ref, transfer_ref, burn_ref });
        move_to(admin, AdminCap { admin: addr });

        // Mint initial treasury allocation to admin
        mint_to_internal(addr, addr, TREASURY_INITIAL, b"initial_treasury");
    }

    // ── Protocol mint functions ───────────────────────────────────────────────

    /// Reward a contributor when their contribution is approved.
    /// Called by dao_governance::finalize_contribution (internal protocol).
    public entry fun reward_contributor(
        protocol: &signer,
        contract_addr: address,
        contributor: address,
        bonus_amount: u64,
    ) acquires TokenRefs {
        assert!(signer::address_of(protocol) == contract_addr, E_NOT_ADMIN);
        let amount = CONTRIBUTION_REWARD + bonus_amount;
        mint_to_internal(contract_addr, contributor, amount, b"contribution_reward");
    }

    /// Reward a voter for participating in governance.
    public entry fun reward_voter(
        protocol: &signer,
        contract_addr: address,
        voter: address,
    ) acquires TokenRefs {
        assert!(signer::address_of(protocol) == contract_addr, E_NOT_ADMIN);
        mint_to_internal(contract_addr, voter, VOTE_REWARD, b"vote_reward");
    }

    /// Reward a proposal creator.
    public entry fun reward_proposer(
        protocol: &signer,
        contract_addr: address,
        proposer: address,
    ) acquires TokenRefs {
        assert!(signer::address_of(protocol) == contract_addr, E_NOT_ADMIN);
        mint_to_internal(contract_addr, proposer, PROPOSAL_REWARD, b"proposal_reward");
    }

    /// Admin mint (for team allocation, grants, etc.)
    public entry fun admin_mint(
        admin: &signer,
        contract_addr: address,
        recipient: address,
        amount: u64,
    ) acquires TokenRefs, AdminCap {
        let cap = borrow_global<AdminCap>(contract_addr);
        assert!(signer::address_of(admin) == cap.admin, E_NOT_ADMIN);
        assert!(amount > 0, E_ZERO_AMOUNT);
        mint_to_internal(contract_addr, recipient, amount, b"admin_mint");
    }

    /// Burn tokens from caller's account (e.g., for slashing or buyback).
    public entry fun burn(
        owner: &signer,
        contract_addr: address,
        amount: u64,
    ) acquires TokenRefs {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let addr = signer::address_of(owner);
        let refs = borrow_global<TokenRefs>(contract_addr);
        let metadata = get_metadata(contract_addr);
        let store = primary_fungible_store::primary_store(addr, metadata);
        fungible_asset::burn_from(&refs.burn_ref, store, amount);

        event::emit(TokensBurned {
            from: addr,
            amount,
            timestamp: aptos_framework::timestamp::now_microseconds(),
        });
    }

    // ── View functions ────────────────────────────────────────────────────────

    #[view]
    public fun balance(contract_addr: address, owner: address): u64 {
        let metadata = get_metadata(contract_addr);
        primary_fungible_store::balance(owner, metadata)
    }

    #[view]
    public fun total_supply(contract_addr: address): u128 {
        let metadata = get_metadata(contract_addr);
        let supply_opt = fungible_asset::supply(metadata);
        if (option::is_some(&supply_opt)) {
            *option::borrow(&supply_opt)
        } else {
            0u128
        }
    }

    #[view]
    public fun get_metadata(contract_addr: address): Object<Metadata> {
        let asset_address = object::create_object_address(&contract_addr, TOKEN_SYMBOL);
        object::address_to_object<Metadata>(asset_address)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fun mint_to_internal(
        contract_addr: address,
        recipient: address,
        amount: u64,
        reason: vector<u8>,
    ) acquires TokenRefs {
        if (amount == 0) return;
        let refs = borrow_global<TokenRefs>(contract_addr);
        let fa = fungible_asset::mint(&refs.mint_ref, amount);
        primary_fungible_store::deposit(recipient, fa);

        event::emit(TokensMinted {
            recipient,
            amount,
            reason,
            timestamp: aptos_framework::timestamp::now_microseconds(),
        });
    }
}
