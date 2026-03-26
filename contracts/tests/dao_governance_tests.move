#[test_only]
module quorum::dao_governance_tests {
    use std::signer;
    use aptos_framework::timestamp;
    use quorum::dao_governance;

    #[test(aptos_framework = @0x1, deployer = @quorum, contributor = @0x111, voter = @0x222)]
    fun test_end_to_end_contribution_and_vote(
        aptos_framework: &signer,
        deployer: &signer,
        contributor: &signer,
        voter: &signer,
    ) {
        // Set up the Aptos framework timestamp for testing
        timestamp::set_time_has_started_for_testing(aptos_framework);

        // 1. Initialize DAO
        dao_governance::initialize(deployer);
        let deployer_addr = signer::address_of(deployer);

        // 2. Register Members
        dao_governance::register_member(contributor);
        dao_governance::register_member(voter);

        let contributor_addr = signer::address_of(contributor);
        let voter_addr = signer::address_of(voter);

        // Initial voting power should be 1
        assert!(dao_governance::get_voting_power(contributor_addr) == 1, 0);
        assert!(dao_governance::get_voting_power(voter_addr) == 1, 1);

        // 3. Submit Contribution
        let dataset_id = b"dataset-1";
        let contribution_id = b"contrib-1";
        let shelby_account = b"shelby-acc";
        let shelby_blob_name = b"blob-1";
        let data_hash = b"hash-1";

        dao_governance::submit_contribution(
            contributor,
            deployer_addr, // The contract address holding the resources
            contribution_id,
            dataset_id,
            shelby_account,
            shelby_blob_name,
            data_hash,
        );

        // 4. Cast Vote
        // Decision 0 means "approve"
        dao_governance::cast_vote(
            voter,
            deployer_addr,
            contribution_id,
            0 // approve
        );

        // 5. Finalize Contribution (requires time to pass beyond VOTING_WINDOW_US)
        timestamp::update_global_time_for_test_secs(172801); // 48 hours + 1 second

        dao_governance::finalize_contribution(
            deployer, // Anyone can call this
            deployer_addr,
            contribution_id,
        );
        
        // After finalization, since the only vote was an approval (100% approval rate), 
        // the contribution should be approved.
        // The tests would normally query the status here, but the contract only emits an event.
        // We ensure it doesn't abort.
    }
}
