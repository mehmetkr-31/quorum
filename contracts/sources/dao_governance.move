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
    const E_DAO_NOT_FOUND: u64 = 7;
    const E_DAO_ALREADY_EXISTS: u64 = 8;
    const E_NOT_DAO_MEMBER: u64 = 9;
    const E_INPUT_TOO_LONG: u64 = 10;
    const E_INVALID_THRESHOLD: u64 = 11;
    const E_INVALID_WINDOW: u64 = 12;
    const E_CONTRIBUTION_EXISTS: u64 = 13;
    const E_PROPOSAL_EXISTS: u64 = 14;
    const E_PROPOSAL_NOT_FOUND: u64 = 15;
    const E_PROPOSAL_CLOSED: u64 = 16;
    const E_PROPOSAL_STILL_OPEN: u64 = 17;
    const E_ALREADY_VOTED_PROPOSAL: u64 = 18;
    const E_NOT_DELEGATOR: u64 = 19;
    const E_SELF_DELEGATION: u64 = 20;

    // ── Constants ────────────────────────────────────────────────────────────
    /// Default 48-hour voting window in microseconds
    const DEFAULT_VOTING_WINDOW_US: u64 = 172_800_000_000;
    /// Default approval threshold: 60% weighted votes required
    const DEFAULT_QUORUM_THRESHOLD: u64 = 60;

    // ── Input size limits ─────────────────────────────────────────────────────
    /// Max DAO/contribution ID length: 128 bytes
    const MAX_ID_BYTES: u64 = 128;
    /// Max name/description length: 256 bytes
    const MAX_NAME_BYTES: u64 = 256;
    /// SHA-256 hash is exactly 32 bytes
    const DATA_HASH_BYTES: u64 = 32;
    /// Max voting window: 30 days in microseconds
    const MAX_VOTING_WINDOW_US: u64 = 2_592_000_000_000;
    /// Min voting window: 1 minute in microseconds
    const MIN_VOTING_WINDOW_US: u64 = 60_000_000;

    // ── Structs ──────────────────────────────────────────────────────────────

    /// Global Member resource — still stored on each user's account for
    /// backward compatibility. Tracks aggregate stats across all DAOs.
    struct Member has key {
        voting_power: u64,
        total_contributions: u64,
        approved_contributions: u64,
    }

    /// Per-DAO configuration and counters
    struct DAOConfig has store {
        dao_id: vector<u8>,
        name: vector<u8>,
        creator: address,
        treasury: address,
        voting_window_us: u64,
        quorum_threshold: u64,
        member_count: u64,
        contribution_count: u64,
        created_at: u64,
    }

    /// Per-DAO member record — tracks voting power and contributions within a specific DAO
    struct DAOMember has store {
        voting_power: u64,
        total_contributions: u64,
        approved_contributions: u64,
    }

    struct Contribution has store {
        dao_id: vector<u8>,
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

    /// DAO Registry — stored on the contract deployer's account
    /// Maps dao_id -> DAOConfig
    struct DAORegistry has key {
        daos: Table<vector<u8>, DAOConfig>,
        dao_count: u64,
    }

    /// DAO Membership store — (dao_id ++ member_address) -> DAOMember
    struct DAOMemberStore has key {
        members: Table<vector<u8>, DAOMember>,
    }

    struct ContributionStore has key {
        contributions: Table<vector<u8>, Contribution>,
    }

    struct VoteStore has key {
        // contribution_id ++ voter_address → voted flag
        voter_keys: Table<vector<u8>, bool>,
    }

    // ── Proposal types ─────────────────────────────────────────────────────────

    /// Governance proposal — on-chain binding vote on DAO parameters
    struct Proposal has store {
        proposal_id: vector<u8>,
        dao_id: vector<u8>,
        proposer: address,
        /// 0 = ParameterChange, 1 = TreasurySpend, 2 = Text
        proposal_type: u8,
        title: vector<u8>,
        description: vector<u8>,
        /// Encoded payload (depends on proposal_type):
        /// ParameterChange: [quorum_threshold_u64 | voting_window_us_u64]
        /// TreasurySpend: [amount_u64 | recipient_address_bcs]
        /// Text: arbitrary
        payload: vector<u8>,
        /// 0=active, 1=passed, 2=rejected, 3=executed
        status: u8,
        yes_power: u64,
        no_power: u64,
        total_power: u64,
        created_at: u64,
        voting_deadline: u64,
    }

    struct ProposalStore has key {
        proposals: Table<vector<u8>, Proposal>,
        /// proposal_id ++ voter_address → voted
        proposal_voter_keys: Table<vector<u8>, bool>,
        proposal_count: u64,
    }

    /// Voting power delegation store
    struct DelegationStore has key {
        /// delegator_address → delegatee_address
        delegations: Table<address, address>,
        /// delegatee_address → total delegated power received
        delegated_power: Table<address, u64>,
    }

    // ── Events ───────────────────────────────────────────────────────────────

    #[event]
    struct DAOCreated has drop, store {
        dao_id: vector<u8>,
        name: vector<u8>,
        creator: address,
        treasury: address,
        timestamp: u64,
    }

    #[event]
    struct DAOMemberJoined has drop, store {
        dao_id: vector<u8>,
        member: address,
        timestamp: u64,
    }

    #[event]
    struct ContributionSubmitted has drop, store {
        dao_id: vector<u8>,
        contribution_id: vector<u8>,
        dataset_id: vector<u8>,
        contributor: address,
        timestamp: u64,
    }

    #[event]
    struct VoteCast has drop, store {
        dao_id: vector<u8>,
        contribution_id: vector<u8>,
        voter: address,
        decision: u8,
        voting_power: u64,
        timestamp: u64,
    }

    #[event]
    struct ContributionFinalized has drop, store {
        dao_id: vector<u8>,
        contribution_id: vector<u8>,
        approved: bool,
        weight: u64,
        timestamp: u64,
    }

    #[event]
    struct ProposalCreated has drop, store {
        dao_id: vector<u8>,
        proposal_id: vector<u8>,
        proposer: address,
        proposal_type: u8,
        title: vector<u8>,
        timestamp: u64,
    }

    #[event]
    struct ProposalVoteCast has drop, store {
        dao_id: vector<u8>,
        proposal_id: vector<u8>,
        voter: address,
        support: bool,
        voting_power: u64,
        timestamp: u64,
    }

    #[event]
    struct ProposalExecuted has drop, store {
        dao_id: vector<u8>,
        proposal_id: vector<u8>,
        passed: bool,
        timestamp: u64,
    }

    #[event]
    struct DelegationSet has drop, store {
        delegator: address,
        delegatee: address,
        power: u64,
        timestamp: u64,
    }

    #[event]
    struct DelegationRevoked has drop, store {
        delegator: address,
        timestamp: u64,
    }

    // ── Entry functions ──────────────────────────────────────────────────────

    /// Deploy: called once by the contract deployer.
    /// Sets up global stores (registry, contributions, votes, memberships).
    public entry fun initialize(account: &signer) {
        let addr = signer::address_of(account);
        if (!exists<DAORegistry>(addr)) {
            move_to(account, DAORegistry {
                daos: table::new(),
                dao_count: 0,
            });
        };
        if (!exists<DAOMemberStore>(addr)) {
            move_to(account, DAOMemberStore { members: table::new() });
        };
        if (!exists<ContributionStore>(addr)) {
            move_to(account, ContributionStore { contributions: table::new() });
        };
        if (!exists<VoteStore>(addr)) {
            move_to(account, VoteStore { voter_keys: table::new() });
        };
        if (!exists<ProposalStore>(addr)) {
            move_to(account, ProposalStore {
                proposals: table::new(),
                proposal_voter_keys: table::new(),
                proposal_count: 0,
            });
        };
        if (!exists<DelegationStore>(addr)) {
            move_to(account, DelegationStore {
                delegations: table::new(),
                delegated_power: table::new(),
            });
        };
        // Backward compat: deployer gets a global Member resource
        if (!exists<Member>(addr)) {
            move_to(account, Member {
                voting_power: 10,
                total_contributions: 0,
                approved_contributions: 0,
            });
        };
    }

    /// Create a new DAO in the registry.
    /// Anyone can create a DAO. The creator is automatically the first member
    /// with elevated voting power (10).
    public entry fun create_dao(
        creator: &signer,
        contract_addr: address,
        dao_id: vector<u8>,
        name: vector<u8>,
        treasury: address,
        voting_window_us: u64,
        quorum_threshold: u64,
    ) acquires DAORegistry, DAOMemberStore {
        let addr = signer::address_of(creator);
        let now = timestamp::now_microseconds();

        // ── Input validation ─────────────────────────────────────────────────
        assert!(vector::length(&dao_id) > 0 && vector::length(&dao_id) <= MAX_ID_BYTES, E_INPUT_TOO_LONG);
        assert!(vector::length(&name) > 0 && vector::length(&name) <= MAX_NAME_BYTES, E_INPUT_TOO_LONG);
        assert!(
            quorum_threshold == 0 || (quorum_threshold >= 1 && quorum_threshold <= 100),
            E_INVALID_THRESHOLD,
        );
        assert!(
            voting_window_us == 0 || (voting_window_us >= MIN_VOTING_WINDOW_US && voting_window_us <= MAX_VOTING_WINDOW_US),
            E_INVALID_WINDOW,
        );

        // Ensure global Member resource exists
        if (!exists<Member>(addr)) {
            move_to(creator, Member {
                voting_power: 1,
                total_contributions: 0,
                approved_contributions: 0,
            });
        };

        let registry = borrow_global_mut<DAORegistry>(contract_addr);
        assert!(!table::contains(&registry.daos, dao_id), E_DAO_ALREADY_EXISTS);

        // Use defaults if zero is passed
        let window = if (voting_window_us > 0) { voting_window_us } else { DEFAULT_VOTING_WINDOW_US };
        let threshold = if (quorum_threshold > 0) { quorum_threshold } else { DEFAULT_QUORUM_THRESHOLD };

        table::add(&mut registry.daos, dao_id, DAOConfig {
            dao_id,
            name,
            creator: addr,
            treasury,
            voting_window_us: window,
            quorum_threshold: threshold,
            member_count: 1,
            contribution_count: 0,
            created_at: now,
        });
        registry.dao_count = registry.dao_count + 1;

        // Auto-register creator as DAO member with elevated voting power
        let member_store = borrow_global_mut<DAOMemberStore>(contract_addr);
        let member_key = make_dao_member_key(dao_id, addr);
        table::add(&mut member_store.members, member_key, DAOMember {
            voting_power: 10,
            total_contributions: 0,
            approved_contributions: 0,
        });

        event::emit(DAOCreated {
            dao_id,
            name,
            creator: addr,
            treasury,
            timestamp: now,
        });

        event::emit(DAOMemberJoined {
            dao_id,
            member: addr,
            timestamp: now,
        });
    }

    /// Join a specific DAO. Anyone can join. Voting power starts at 1.
    public entry fun join_dao(
        account: &signer,
        contract_addr: address,
        dao_id: vector<u8>,
    ) acquires DAORegistry, DAOMemberStore {
        let addr = signer::address_of(account);

        // Ensure global Member resource exists
        if (!exists<Member>(addr)) {
            move_to(account, Member {
                voting_power: 1,
                total_contributions: 0,
                approved_contributions: 0,
            });
        };

        let registry = borrow_global<DAORegistry>(contract_addr);
        assert!(table::contains(&registry.daos, dao_id), E_DAO_NOT_FOUND);

        let member_store = borrow_global_mut<DAOMemberStore>(contract_addr);
        let member_key = make_dao_member_key(dao_id, addr);

        // Idempotent — don't error if already a member
        if (!table::contains(&member_store.members, member_key)) {
            table::add(&mut member_store.members, member_key, DAOMember {
                voting_power: 1,
                total_contributions: 0,
                approved_contributions: 0,
            });

            // Increment DAO member count
            let registry_mut = borrow_global_mut<DAORegistry>(contract_addr);
            let dao = table::borrow_mut(&mut registry_mut.daos, dao_id);
            dao.member_count = dao.member_count + 1;

            event::emit(DAOMemberJoined {
                dao_id,
                member: addr,
                timestamp: timestamp::now_microseconds(),
            });
        };
    }

    /// Backward-compatible: register as a global member (no DAO scope)
    public entry fun register_member(account: &signer) {
        if (!exists<Member>(signer::address_of(account))) {
            move_to(account, Member {
                voting_power: 1,
                total_contributions: 0,
                approved_contributions: 0,
            });
        };
    }

    /// Submit a contribution to a specific DAO's dataset.
    /// Contributor must be a member of the DAO.
    public entry fun submit_contribution(
        contributor: &signer,
        contract_addr: address,
        dao_id: vector<u8>,
        contribution_id: vector<u8>,
        dataset_id: vector<u8>,
        shelby_account: vector<u8>,
        shelby_blob_name: vector<u8>,
        data_hash: vector<u8>,
    ) acquires DAORegistry, DAOMemberStore, ContributionStore, Member {
        let addr = signer::address_of(contributor);
        assert!(exists<Member>(addr), E_NOT_MEMBER);

        // ── Input validation ─────────────────────────────────────────────────
        assert!(vector::length(&contribution_id) > 0 && vector::length(&contribution_id) <= MAX_ID_BYTES, E_INPUT_TOO_LONG);
        assert!(vector::length(&dao_id) > 0 && vector::length(&dao_id) <= MAX_ID_BYTES, E_INPUT_TOO_LONG);
        assert!(vector::length(&dataset_id) > 0 && vector::length(&dataset_id) <= MAX_ID_BYTES, E_INPUT_TOO_LONG);
        assert!(vector::length(&data_hash) == DATA_HASH_BYTES, E_INPUT_TOO_LONG);

        // Verify DAO exists and contributor is a member
        let registry = borrow_global<DAORegistry>(contract_addr);
        assert!(table::contains(&registry.daos, dao_id), E_DAO_NOT_FOUND);
        let dao = table::borrow(&registry.daos, dao_id);

        let member_store_ref = borrow_global<DAOMemberStore>(contract_addr);
        let member_key = make_dao_member_key(dao_id, addr);
        assert!(table::contains(&member_store_ref.members, member_key), E_NOT_DAO_MEMBER);

        let now = timestamp::now_microseconds();
        let voting_window = dao.voting_window_us;

        let store = borrow_global_mut<ContributionStore>(contract_addr);
        // Prevent duplicate contribution IDs
        assert!(!table::contains(&store.contributions, contribution_id), E_CONTRIBUTION_EXISTS);
        table::add(&mut store.contributions, contribution_id, Contribution {
            dao_id,
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
            voting_deadline: now + voting_window,
        });

        // Update global member stats
        let member = borrow_global_mut<Member>(addr);
        member.total_contributions = member.total_contributions + 1;

        // Update DAO-scoped member stats
        let member_store_mut = borrow_global_mut<DAOMemberStore>(contract_addr);
        let dao_member = table::borrow_mut(&mut member_store_mut.members, member_key);
        dao_member.total_contributions = dao_member.total_contributions + 1;

        // Increment DAO contribution count
        let registry_mut = borrow_global_mut<DAORegistry>(contract_addr);
        let dao_mut = table::borrow_mut(&mut registry_mut.daos, dao_id);
        dao_mut.contribution_count = dao_mut.contribution_count + 1;

        event::emit(ContributionSubmitted {
            dao_id,
            contribution_id,
            dataset_id,
            contributor: addr,
            timestamp: now,
        });
    }

    /// Cast a vote on a contribution. Voter must be a member of the DAO
    /// that the contribution belongs to.
    public entry fun cast_vote(
        voter: &signer,
        contract_addr: address,
        contribution_id: vector<u8>,
        decision: u8,
    ) acquires ContributionStore, VoteStore, DAOMemberStore, Member {
        assert!(decision <= 2, E_INVALID_DECISION);
        let addr = signer::address_of(voter);
        assert!(exists<Member>(addr), E_NOT_MEMBER);

        let now = timestamp::now_microseconds();
        let store = borrow_global_mut<ContributionStore>(contract_addr);
        let contribution = table::borrow_mut(&mut store.contributions, contribution_id);
        assert!(contribution.status == 0, E_ALREADY_FINALIZED);
        assert!(now <= contribution.voting_deadline, E_VOTING_CLOSED);

        let dao_id = contribution.dao_id;

        // Verify voter is a member of this contribution's DAO
        let member_store_ref = borrow_global<DAOMemberStore>(contract_addr);
        let member_key = make_dao_member_key(dao_id, addr);
        assert!(table::contains(&member_store_ref.members, member_key), E_NOT_DAO_MEMBER);

        // Use DAO-scoped voting power
        let dao_member = table::borrow(&member_store_ref.members, member_key);
        let power = dao_member.voting_power;

        // Prevent double-voting
        let vote_store = borrow_global_mut<VoteStore>(contract_addr);
        let voter_key = make_voter_key(addr, contribution_id);
        assert!(!table::contains(&vote_store.voter_keys, voter_key), E_ALREADY_VOTED);
        table::add(&mut vote_store.voter_keys, voter_key, true);

        contribution.total_power = contribution.total_power + power;
        if (decision == 0) {
            contribution.approve_power = contribution.approve_power + power;
        } else if (decision == 1) {
            contribution.reject_power = contribution.reject_power + power;
        };

        event::emit(VoteCast {
            dao_id,
            contribution_id,
            voter: addr,
            decision,
            voting_power: power,
            timestamp: now,
        });
    }

    /// Anyone can finalize a contribution after the voting window closes.
    /// Uses the DAO's quorum threshold.
    public entry fun finalize_contribution(
        _caller: &signer,
        contract_addr: address,
        contribution_id: vector<u8>,
    ) acquires ContributionStore, DAORegistry, DAOMemberStore, Member {
        let now = timestamp::now_microseconds();
        let store = borrow_global_mut<ContributionStore>(contract_addr);
        let contribution = table::borrow_mut(&mut store.contributions, contribution_id);
        assert!(contribution.status == 0, E_ALREADY_FINALIZED);
        assert!(now > contribution.voting_deadline, E_VOTING_STILL_OPEN);

        let dao_id = contribution.dao_id;
        let contributor = contribution.contributor;

        // Get DAO-specific quorum threshold
        let registry = borrow_global<DAORegistry>(contract_addr);
        let threshold = if (table::contains(&registry.daos, dao_id)) {
            table::borrow(&registry.daos, dao_id).quorum_threshold
        } else {
            DEFAULT_QUORUM_THRESHOLD
        };

        let approved = contribution.total_power > 0 &&
            (contribution.approve_power * 100 / contribution.total_power) >= threshold;

        if (approved) {
            contribution.status = 1;
            contribution.weight = contribution.approve_power;

            // Update global member stats
            if (exists<Member>(contributor)) {
                let member = borrow_global_mut<Member>(contributor);
                member.approved_contributions = member.approved_contributions + 1;
                // Guard against division by zero
                if (member.total_contributions > 0) {
                    let rate = member.approved_contributions * 100 / member.total_contributions;
                    if (rate >= 80 && member.voting_power < 100) {
                        member.voting_power = member.voting_power + 1;
                    };
                };
            };

            // Update DAO-scoped member stats
            let member_store = borrow_global_mut<DAOMemberStore>(contract_addr);
            let member_key = make_dao_member_key(dao_id, contributor);
            if (table::contains(&member_store.members, member_key)) {
                let dao_member = table::borrow_mut(&mut member_store.members, member_key);
                dao_member.approved_contributions = dao_member.approved_contributions + 1;
                // Guard against division by zero
                if (dao_member.total_contributions > 0) {
                    let dao_rate = dao_member.approved_contributions * 100 / dao_member.total_contributions;
                    if (dao_rate >= 80 && dao_member.voting_power < 100) {
                        dao_member.voting_power = dao_member.voting_power + 1;
                    };
                };
            };
        } else {
            contribution.status = 2;
        };

        event::emit(ContributionFinalized {
            dao_id,
            contribution_id,
            approved,
            weight: contribution.weight,
            timestamp: now,
        });
    }

    // ── Governance Proposals ─────────────────────────────────────────────────

    /// Create a governance proposal. Proposer must be a DAO member.
    /// proposal_type: 0=ParameterChange, 1=TreasurySpend, 2=Text
    public entry fun create_proposal(
        proposer: &signer,
        contract_addr: address,
        dao_id: vector<u8>,
        proposal_id: vector<u8>,
        proposal_type: u8,
        title: vector<u8>,
        description: vector<u8>,
        payload: vector<u8>,
    ) acquires DAORegistry, DAOMemberStore, ProposalStore {
        let addr = signer::address_of(proposer);

        // ── Input validation ─────────────────────────────────────────────────
        assert!(vector::length(&proposal_id) > 0 && vector::length(&proposal_id) <= MAX_ID_BYTES, E_INPUT_TOO_LONG);
        assert!(vector::length(&title) > 0 && vector::length(&title) <= MAX_NAME_BYTES, E_INPUT_TOO_LONG);
        assert!(proposal_type <= 2, E_INVALID_DECISION);

        // Verify DAO exists and proposer is a member
        let registry = borrow_global<DAORegistry>(contract_addr);
        assert!(table::contains(&registry.daos, dao_id), E_DAO_NOT_FOUND);
        let dao = table::borrow(&registry.daos, dao_id);
        let voting_window = dao.voting_window_us;

        let member_store = borrow_global<DAOMemberStore>(contract_addr);
        let member_key = make_dao_member_key(dao_id, addr);
        assert!(table::contains(&member_store.members, member_key), E_NOT_DAO_MEMBER);

        let prop_store = borrow_global_mut<ProposalStore>(contract_addr);
        assert!(!table::contains(&prop_store.proposals, proposal_id), E_PROPOSAL_EXISTS);

        let now = timestamp::now_microseconds();
        table::add(&mut prop_store.proposals, proposal_id, Proposal {
            proposal_id,
            dao_id,
            proposer: addr,
            proposal_type,
            title,
            description,
            payload,
            status: 0,
            yes_power: 0,
            no_power: 0,
            total_power: 0,
            created_at: now,
            voting_deadline: now + voting_window,
        });
        prop_store.proposal_count = prop_store.proposal_count + 1;

        event::emit(ProposalCreated {
            dao_id,
            proposal_id,
            proposer: addr,
            proposal_type,
            title,
            timestamp: now,
        });
    }

    /// Vote on a governance proposal. Support=true means "for", false means "against".
    public entry fun vote_on_proposal(
        voter: &signer,
        contract_addr: address,
        proposal_id: vector<u8>,
        support: bool,
    ) acquires ProposalStore, DAOMemberStore, DelegationStore, Member {
        let addr = signer::address_of(voter);
        assert!(exists<Member>(addr), E_NOT_MEMBER);

        let now = timestamp::now_microseconds();
        let prop_store = borrow_global_mut<ProposalStore>(contract_addr);
        assert!(table::contains(&prop_store.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);

        let proposal = table::borrow_mut(&mut prop_store.proposals, proposal_id);
        assert!(proposal.status == 0, E_PROPOSAL_CLOSED);
        assert!(now <= proposal.voting_deadline, E_PROPOSAL_CLOSED);

        // Prevent double-voting
        let voter_key = make_voter_key(addr, proposal_id);
        assert!(!table::contains(&prop_store.proposal_voter_keys, voter_key), E_ALREADY_VOTED_PROPOSAL);
        table::add(&mut prop_store.proposal_voter_keys, voter_key, true);

        let dao_id = proposal.dao_id;

        // Get DAO-scoped base voting power
        let member_store = borrow_global<DAOMemberStore>(contract_addr);
        let member_key = make_dao_member_key(dao_id, addr);
        assert!(table::contains(&member_store.members, member_key), E_NOT_DAO_MEMBER);
        let base_power = table::borrow(&member_store.members, member_key).voting_power;

        // Add delegated power
        let del_store = borrow_global<DelegationStore>(contract_addr);
        let delegated = if (table::contains(&del_store.delegated_power, addr)) {
            *table::borrow(&del_store.delegated_power, addr)
        } else { 0 };

        let total_power = base_power + delegated;

        proposal.total_power = proposal.total_power + total_power;
        if (support) {
            proposal.yes_power = proposal.yes_power + total_power;
        } else {
            proposal.no_power = proposal.no_power + total_power;
        };

        event::emit(ProposalVoteCast {
            dao_id,
            proposal_id,
            voter: addr,
            support,
            voting_power: total_power,
            timestamp: now,
        });
    }

    /// Finalize a proposal after the voting window closes.
    /// If passed, ParameterChange proposals are executed on-chain immediately.
    public entry fun finalize_proposal(
        _caller: &signer,
        contract_addr: address,
        proposal_id: vector<u8>,
    ) acquires ProposalStore, DAORegistry {
        let now = timestamp::now_microseconds();
        let prop_store = borrow_global_mut<ProposalStore>(contract_addr);
        assert!(table::contains(&prop_store.proposals, proposal_id), E_PROPOSAL_NOT_FOUND);

        let proposal = table::borrow_mut(&mut prop_store.proposals, proposal_id);
        assert!(proposal.status == 0, E_PROPOSAL_CLOSED);
        assert!(now > proposal.voting_deadline, E_PROPOSAL_STILL_OPEN);

        let dao_id = proposal.dao_id;

        // Get DAO quorum threshold
        let registry_ref = borrow_global<DAORegistry>(contract_addr);
        let threshold = if (table::contains(&registry_ref.daos, dao_id)) {
            table::borrow(&registry_ref.daos, dao_id).quorum_threshold
        } else {
            DEFAULT_QUORUM_THRESHOLD
        };

        let passed = proposal.total_power > 0 &&
            (proposal.yes_power * 100 / proposal.total_power) >= threshold;

        proposal.status = if (passed) { 1 } else { 2 };

        // Execute ParameterChange proposals immediately if passed
        if (passed && proposal.proposal_type == 0) {
            proposal.status = 3; // executed
            // Payload: first 8 bytes = new quorum_threshold (u64 little-endian)
            // next 8 bytes = new voting_window_us (u64 little-endian)
            let registry = borrow_global_mut<DAORegistry>(contract_addr);
            if (table::contains(&registry.daos, dao_id)) {
                let dao = table::borrow_mut(&mut registry.daos, dao_id);
                let payload = &proposal.payload;
                if (vector::length(payload) >= 8) {
                    // Read new quorum threshold (first 8 bytes as u64)
                    let new_threshold = read_u64_le(payload, 0);
                    if (new_threshold >= 1 && new_threshold <= 100) {
                        dao.quorum_threshold = new_threshold;
                    };
                };
                if (vector::length(payload) >= 16) {
                    let new_window = read_u64_le(payload, 8);
                    if (new_window >= MIN_VOTING_WINDOW_US && new_window <= MAX_VOTING_WINDOW_US) {
                        dao.voting_window_us = new_window;
                    };
                };
            };
        };

        event::emit(ProposalExecuted {
            dao_id,
            proposal_id,
            passed,
            timestamp: now,
        });
    }

    // ── Delegation ────────────────────────────────────────────────────────────

    /// Delegate your DAO voting power to another address.
    /// The delegatee's effective VP = their own VP + sum of all delegators' VP.
    public entry fun delegate(
        delegator: &signer,
        contract_addr: address,
        dao_id: vector<u8>,
        delegatee: address,
    ) acquires DAOMemberStore, DelegationStore {
        let addr = signer::address_of(delegator);
        assert!(addr != delegatee, E_SELF_DELEGATION);

        // Both must be DAO members
        let member_store = borrow_global<DAOMemberStore>(contract_addr);
        let delegator_key = make_dao_member_key(dao_id, addr);
        let delegatee_key = make_dao_member_key(dao_id, delegatee);
        assert!(table::contains(&member_store.members, delegator_key), E_NOT_DAO_MEMBER);
        assert!(table::contains(&member_store.members, delegatee_key), E_NOT_DAO_MEMBER);

        let power = table::borrow(&member_store.members, delegator_key).voting_power;

        let del_store = borrow_global_mut<DelegationStore>(contract_addr);

        // Remove previous delegation if exists
        if (table::contains(&del_store.delegations, addr)) {
            let prev_delegatee = *table::borrow(&del_store.delegations, addr);
            if (table::contains(&del_store.delegated_power, prev_delegatee)) {
                let prev_power = table::borrow_mut(&mut del_store.delegated_power, prev_delegatee);
                if (*prev_power >= power) {
                    *prev_power = *prev_power - power;
                };
            };
            let _ = table::remove(&mut del_store.delegations, addr);
        };

        // Set new delegation
        table::add(&mut del_store.delegations, addr, delegatee);
        if (table::contains(&del_store.delegated_power, delegatee)) {
            let dp = table::borrow_mut(&mut del_store.delegated_power, delegatee);
            *dp = *dp + power;
        } else {
            table::add(&mut del_store.delegated_power, delegatee, power);
        };

        event::emit(DelegationSet {
            delegator: addr,
            delegatee,
            power,
            timestamp: timestamp::now_microseconds(),
        });
    }

    /// Revoke delegation — take back your voting power.
    public entry fun revoke_delegation(
        delegator: &signer,
        contract_addr: address,
        dao_id: vector<u8>,
    ) acquires DAOMemberStore, DelegationStore {
        let addr = signer::address_of(delegator);
        let del_store = borrow_global_mut<DelegationStore>(contract_addr);
        assert!(table::contains(&del_store.delegations, addr), E_NOT_DELEGATOR);

        let member_store = borrow_global<DAOMemberStore>(contract_addr);
        let delegator_key = make_dao_member_key(dao_id, addr);
        let power = if (table::contains(&member_store.members, delegator_key)) {
            table::borrow(&member_store.members, delegator_key).voting_power
        } else { 0 };

        let delegatee = table::remove(&mut del_store.delegations, addr);
        if (table::contains(&del_store.delegated_power, delegatee)) {
            let dp = table::borrow_mut(&mut del_store.delegated_power, delegatee);
            if (*dp >= power) { *dp = *dp - power; };
        };

        event::emit(DelegationRevoked {
            delegator: addr,
            timestamp: timestamp::now_microseconds(),
        });
    }

    // ── View functions ───────────────────────────────────────────────────────

    /// Get global voting power (backward compatible)
    #[view]
    public fun get_voting_power(member_addr: address): u64 acquires Member {
        if (exists<Member>(member_addr)) borrow_global<Member>(member_addr).voting_power
        else 0
    }

    /// Get DAO-scoped voting power for a member
    #[view]
    public fun get_dao_voting_power(
        contract_addr: address,
        dao_id: vector<u8>,
        member_addr: address,
    ): u64 acquires DAOMemberStore {
        let member_store = borrow_global<DAOMemberStore>(contract_addr);
        let member_key = make_dao_member_key(dao_id, member_addr);
        if (table::contains(&member_store.members, member_key)) {
            table::borrow(&member_store.members, member_key).voting_power
        } else {
            0
        }
    }

    /// Get DAO member count
    #[view]
    public fun get_dao_member_count(
        contract_addr: address,
        dao_id: vector<u8>,
    ): u64 acquires DAORegistry {
        let registry = borrow_global<DAORegistry>(contract_addr);
        if (table::contains(&registry.daos, dao_id)) {
            table::borrow(&registry.daos, dao_id).member_count
        } else {
            0
        }
    }

    /// Get total number of DAOs
    #[view]
    public fun get_dao_count(contract_addr: address): u64 acquires DAORegistry {
        borrow_global<DAORegistry>(contract_addr).dao_count
    }

    /// Get proposal count for a DAO
    #[view]
    public fun get_proposal_count(contract_addr: address): u64 acquires ProposalStore {
        if (!exists<ProposalStore>(contract_addr)) return 0;
        borrow_global<ProposalStore>(contract_addr).proposal_count
    }

    /// Get delegatee for a delegator (returns zero address if not delegating)
    #[view]
    public fun get_delegation(contract_addr: address, delegator: address): address acquires DelegationStore {
        if (!exists<DelegationStore>(contract_addr)) return @0x0;
        let store = borrow_global<DelegationStore>(contract_addr);
        if (table::contains(&store.delegations, delegator)) {
            *table::borrow(&store.delegations, delegator)
        } else {
            @0x0
        }
    }

    /// Get total delegated power received by an address
    #[view]
    public fun get_delegated_power(contract_addr: address, delegatee: address): u64 acquires DelegationStore {
        if (!exists<DelegationStore>(contract_addr)) return 0;
        let store = borrow_global<DelegationStore>(contract_addr);
        if (table::contains(&store.delegated_power, delegatee)) {
            *table::borrow(&store.delegated_power, delegatee)
        } else {
            0
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    fun make_voter_key(voter: address, contribution_id: vector<u8>): vector<u8> {
        let key = std::bcs::to_bytes(&voter);
        vector::append(&mut key, contribution_id);
        key
    }

    /// Composite key: dao_id ++ BCS(member_address)
    fun make_dao_member_key(dao_id: vector<u8>, member: address): vector<u8> {
        let key = dao_id;
        let addr_bytes = std::bcs::to_bytes(&member);
        vector::append(&mut key, addr_bytes);
        key
    }

    /// Read a little-endian u64 from a vector at the given byte offset
    fun read_u64_le(data: &vector<u8>, offset: u64): u64 {
        let result = 0u64;
        let i = 0u64;
        while (i < 8) {
            let byte = (*vector::borrow(data, offset + i) as u64);
            result = result | (byte << (i * 8));
            i = i + 1;
        };
        result
    }
}
