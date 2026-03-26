#[test_only]
module quorum::revenue_splitter_tests {
    use std::signer;
    use std::vector;
    use aptos_framework::timestamp;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::account;
    use quorum::revenue_splitter;

    #[test(
        aptos_framework = @0x1,
        deployer = @quorum,
        treasury = @0x888,
        payer = @0x999,
        contributor1 = @0x111,
        contributor2 = @0x222,
        curator = @0x333
    )]
    fun test_distribute_revenue(
        aptos_framework: &signer,
        deployer: &signer,
        treasury: &signer,
        payer: &signer,
        contributor1: &signer,
        contributor2: &signer,
        curator: &signer,
    ) {
        let deployer_addr = signer::address_of(deployer);
        let treasury_addr = signer::address_of(treasury);
        let payer_addr = signer::address_of(payer);

        timestamp::set_time_has_started_for_testing(aptos_framework);
        let (burn_cap, mint_cap) = aptos_framework::aptos_coin::initialize_for_test(aptos_framework);
        
        // Setup accounts to hold APT
        account::create_account_for_test(treasury_addr);
        account::create_account_for_test(payer_addr);
        account::create_account_for_test(signer::address_of(contributor1));
        account::create_account_for_test(signer::address_of(contributor2));
        account::create_account_for_test(signer::address_of(curator));

        coin::register<AptosCoin>(treasury);
        coin::register<AptosCoin>(payer);
        coin::register<AptosCoin>(contributor1);
        coin::register<AptosCoin>(contributor2);
        coin::register<AptosCoin>(curator);

        // Mint some APT to payer (1000 APT = 100,000,000,000 Octas)
        let amount = 100_000_000_000;
        coin::deposit<AptosCoin>(payer_addr, coin::mint<AptosCoin>(amount, &mint_cap));

        // Destroy caps as we don't need them anymore
        coin::destroy_mint_cap(mint_cap);
        coin::destroy_burn_cap(burn_cap);

        // Initialize revenue splitter
        revenue_splitter::initialize(deployer, treasury_addr);

        let dataset_id = b"dataset-1";
        let receipt_hash = b"receipt-abc";

        // Anchor the receipt
        revenue_splitter::anchor_receipt(
            payer, // Usually reader anchors it
            deployer_addr,
            dataset_id,
            receipt_hash,
            100_000 // 100,000 Octas
        );

        // Distribute revenue
        let contributor_addrs = vector::empty<address>();
        vector::push_back(&mut contributor_addrs, signer::address_of(contributor1));
        vector::push_back(&mut contributor_addrs, signer::address_of(contributor2));

        let contributor_weights = vector::empty<u64>();
        vector::push_back(&mut contributor_weights, 30);
        vector::push_back(&mut contributor_weights, 70);

        let curator_addrs = vector::empty<address>();
        vector::push_back(&mut curator_addrs, signer::address_of(curator));

        let curator_powers = vector::empty<u64>();
        vector::push_back(&mut curator_powers, 100);

        // 70% of 100,000 = 70,000 for contributors. (C1 gets 30%, C2 gets 70%)
        // C1 gets 21,000, C2 gets 49,000
        // 20% of 100,000 = 20,000 for curators. (C gets 100%)
        // Treasury gets the rest 10% = 10,000
        revenue_splitter::distribute_revenue(
            payer,
            deployer_addr,
            dataset_id,
            receipt_hash,
            100_000,
            contributor_addrs,
            contributor_weights,
            curator_addrs,
            curator_powers,
        );

        // Validate balances
        assert!(coin::balance<AptosCoin>(signer::address_of(contributor1)) == 21_000, 10);
        assert!(coin::balance<AptosCoin>(signer::address_of(contributor2)) == 49_000, 11);
        assert!(coin::balance<AptosCoin>(signer::address_of(curator)) == 20_000, 12);
        assert!(coin::balance<AptosCoin>(treasury_addr) == 10_000, 13);
    }
}