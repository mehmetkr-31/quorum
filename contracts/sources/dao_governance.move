module quorum::dao_governance {
    use std::signer;
    use std::vector;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_std::table::{Self, Table};

    // ── Error codes ──────────────────────────────────────────────────────────
    const E_NOT_MEMBER: u64 = 1;
    const E_ALREADY_VOTED: u64 = 2;
    const E_INVALID_DECISION: u64 = 3;
    const E_VOTING_CLOSED: u64 = 4;
    const E_ALREADY_FINALIZED: u64 = 5;
    const E_VOTING_STILL_OPEN: u64 = 6;

    // ── Constants ────────────────────────────────────────────────────────────
    /// 48-hour voting window in microseconds
    const VOTING_WINDOW_US: u64 = 60_000_000;
    /// Approval threshold: 60% weighted votes required
    const QUORUM_THRESHOLD: u64 = 60;

    // ── Structs ──────────────────────────────────────────────────────────────
    struct Member has key {
        voting_power: u64,
        total_contributions: u64,
        approved_contributions: u64,
    }

    struct Contribution has store {
        dataset_id: vector<u8>,
        contributor: address,
        shelby_account: vector<u8>,
        shelby_blob_name: vector<u8>,
        data_hash: vector<u8>,
        status: u8,           // 0=pending, 1=approved, 2=rejected
        weight: u64,
        approve_power: u64,
        reject_power: u64,
        total_power: u64,
        created_at: u64,
        voting_deadline: u64,
    }

    struct ContributionStore has key {
        contributions: Table<vector<u8>, Contribution>,
    }

    struct VoteStore has key {
        // contribution_id ++ voter_address → voted flag
        voter_keys: Table<vector<u8>, bool>,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    #[event]
    struct ContributionSubmitted has drop, store {
        contribution_id: vector<u8>,
        dataset_id: vector<u8>,
        contributor: address,
        timestamp: u64,
    }

    #[event]
    struct VoteCast has drop, store {
        contribution_id: vector<u8>,
        voter: address,
        decision: u8,
        voting_power: u64,
        timestamp: u64,
    }

    #[event]
    struct ContributionFinalized has drop, store {
        contribution_id: vector<u8>,
        approved: bool,
        weight: u64,
        timestamp: u64,
    }

    // ── Entry functions ──────────────────────────────────────────────────────

    /// Deploy: called once by the contract deployer
    public entry fun initialize(account: &signer) {
        let addr = signer::address_of(account);
        if (!exists<ContributionStore>(addr)) {
            move_to(account, ContributionStore { contributions: table::new() });
        };
        if (!exists<VoteStore>(addr)) {
            move_to(account, VoteStore { voter_keys: table::new() });
        };
        if (!exists<Member>(addr)) {
            move_to(account, Member {
                voting_power: 10,
                total_contributions: 0,
                approved_contributions: 0,
            });
        };
    }

    /// Anyone can join the DAO as a member (voting_power starts at 1)
    public entry fun register_member(account: &signer) {
        if (!exists<Member>(signer::address_of(account))) {
            move_to(account, Member {
                voting_power: 1,
                total_contributions: 0,
                approved_contributions: 0,
            });
        };
    }

    public entry fun submit_contribution(
        contributor: &signer,
        contract_addr: address,
        contribution_id: vector<u8>,
        dataset_id: vector<u8>,
        shelby_account: vector<u8>,
        shelby_blob_name: vector<u8>,
        data_hash: vector<u8>,
    ) acquires ContributionStore, Member {
        let addr = signer::address_of(contributor);
        assert!(exists<Member>(addr), E_NOT_MEMBER);

        let now = timestamp::now_microseconds();
        let store = borrow_global_mut<ContributionStore>(contract_addr);

        table::add(&mut store.contributions, contribution_id, Contribution {
            dataset_id,
            contributor: addr,
            shelby_account,
            shelby_blob_name,
            data_hash,
            status: 0,
            weight: 0,
            approve_power: 0,
            reject_power: 0,
            total_power: 0,
            created_at: now,
            voting_deadline: now + VOTING_WINDOW_US,
        });

        let member = borrow_global_mut<Member>(addr);
        member.total_contributions = member.total_contributions + 1;

        event::emit(ContributionSubmitted {
            contribution_id,
            dataset_id: *&table::borrow(&store.contributions, contribution_id).dataset_id,
            contributor: addr,
            timestamp: now,
        });
    }

    public entry fun cast_vote(
        voter: &signer,
        contract_addr: address,
        contribution_id: vector<u8>,
        decision: u8,
    ) acquires ContributionStore, VoteStore, Member {
        assert!(decision <= 2, E_INVALID_DECISION);
        let addr = signer::address_of(voter);
        assert!(exists<Member>(addr), E_NOT_MEMBER);

        let now = timestamp::now_microseconds();
        let store = borrow_global_mut<ContributionStore>(contract_addr);
        let contribution = table::borrow_mut(&mut store.contributions, contribution_id);
        assert!(contribution.status == 0, E_ALREADY_FINALIZED);
        assert!(now <= contribution.voting_deadline, E_VOTING_CLOSED);

        // Prevent double-voting
        let vote_store = borrow_global_mut<VoteStore>(contract_addr);
        let voter_key = make_voter_key(addr, contribution_id);
        assert!(!table::contains(&vote_store.voter_keys, voter_key), E_ALREADY_VOTED);
        table::add(&mut vote_store.voter_keys, voter_key, true);

        let power = borrow_global<Member>(addr).voting_power;
        contribution.total_power = contribution.total_power + power;
        if (decision == 0) {
            contribution.approve_power = contribution.approve_power + power;
        } else if (decision == 1) {
            contribution.reject_power = contribution.reject_power + power;
        };

        event::emit(VoteCast {
            contribution_id,
            voter: addr,
            decision,
            voting_power: power,
            timestamp: now,
        });
    }

    /// Anyone can finalize a contribution after the voting window closes
    public entry fun finalize_contribution(
        _caller: &signer,
        contract_addr: address,
        contribution_id: vector<u8>,
    ) acquires ContributionStore, Member {
        let now = timestamp::now_microseconds();
        let store = borrow_global_mut<ContributionStore>(contract_addr);
        let contribution = table::borrow_mut(&mut store.contributions, contribution_id);
        assert!(contribution.status == 0, E_ALREADY_FINALIZED);
        assert!(now > contribution.voting_deadline, E_VOTING_STILL_OPEN);

        let approved = contribution.total_power > 0 &&
            (contribution.approve_power * 100 / contribution.total_power) >= QUORUM_THRESHOLD;

        if (approved) {
            contribution.status = 1;
            contribution.weight = contribution.approve_power;
            let contributor = contribution.contributor;
            if (exists<Member>(contributor)) {
                let member = borrow_global_mut<Member>(contributor);
                member.approved_contributions = member.approved_contributions + 1;
                // Boost voting power for contributors with ≥80% approval rate
                let rate = member.approved_contributions * 100 / member.total_contributions;
                if (rate >= 80 && member.voting_power < 100) {
                    member.voting_power = member.voting_power + 1;
                };
            };
        } else {
            contribution.status = 2;
        };

        event::emit(ContributionFinalized {
            contribution_id,
            approved,
            weight: contribution.weight,
            timestamp: now,
        });
    }

    // ── View functions ───────────────────────────────────────────────────────
    #[view]
    public fun get_voting_power(member_addr: address): u64 acquires Member {
        if (exists<Member>(member_addr)) borrow_global<Member>(member_addr).voting_power
        else 0
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    fun make_voter_key(voter: address, contribution_id: vector<u8>): vector<u8> {
        let key = std::bcs::to_bytes(&voter);
        vector::append(&mut key, contribution_id);
        key
    }
}
