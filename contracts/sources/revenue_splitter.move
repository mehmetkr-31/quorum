module quorum::revenue_splitter {
    use std::signer;
    use std::vector;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_std::table::{Self, Table};

    // ── Error codes ──────────────────────────────────────────────────────────
    const E_ALREADY_DISTRIBUTED: u64 = 1;
    const E_ZERO_AMOUNT: u64 = 2;
    const E_RECEIPT_NOT_ANCHORED: u64 = 3;

    // ── Revenue split ────────────────────────────────────────────────────────
    /// 70% to contributors, 20% to curators, 10% to treasury
    const CONTRIBUTOR_BPS: u64 = 70;
    const CURATOR_BPS: u64 = 20;

    // ── Structs ──────────────────────────────────────────────────────────────

    struct ReceiptAnchor has store {
        dao_id: vector<u8>,
        dataset_id: vector<u8>,
        reader: address,
        amount: u64,
        anchored_at: u64,
    }

    struct DistributionRecord has store {
        dao_id: vector<u8>,
        dataset_id: vector<u8>,
        total_amount: u64,
        timestamp: u64,
    }

    struct DistributionStore has key {
        // shelby_receipt_hash → anchor record
        anchors: Table<vector<u8>, ReceiptAnchor>,
        // shelby_receipt_hash → distribution record (ensures idempotency)
        records: Table<vector<u8>, DistributionRecord>,
        treasury: address,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    #[event]
    struct ReceiptAnchored has drop, store {
        dao_id: vector<u8>,
        dataset_id: vector<u8>,
        shelby_receipt_hash: vector<u8>,
        reader: address,
        amount: u64,
        timestamp: u64,
    }

    #[event]
    struct RevenueDistributed has drop, store {
        dao_id: vector<u8>,
        dataset_id: vector<u8>,
        shelby_receipt_hash: vector<u8>,
        total_amount: u64,
        contributor_amount: u64,
        curator_amount: u64,
        treasury_amount: u64,
        timestamp: u64,
    }

    // ── Entry functions ──────────────────────────────────────────────────────

    public entry fun initialize(account: &signer, treasury: address) {
        let addr = signer::address_of(account);
        if (!exists<DistributionStore>(addr)) {
            move_to(account, DistributionStore {
                anchors: table::new(),
                records: table::new(),
                treasury,
            });
        };
    }

    /// Step 1: anchor a Shelby receipt on-chain immediately when a dataset is read.
    /// Now includes dao_id for multi-DAO tracking.
    public entry fun anchor_receipt(
        reader: &signer,
        contract_addr: address,
        dao_id: vector<u8>,
        dataset_id: vector<u8>,
        shelby_receipt_hash: vector<u8>,
        amount: u64,
    ) acquires DistributionStore {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let store = borrow_global_mut<DistributionStore>(contract_addr);
        // Idempotent: don't error if already anchored
        if (!table::contains(&store.anchors, shelby_receipt_hash)) {
            let now = timestamp::now_microseconds();
            table::add(&mut store.anchors, shelby_receipt_hash, ReceiptAnchor {
                dao_id,
                dataset_id,
                reader: signer::address_of(reader),
                amount,
                anchored_at: now,
            });
            event::emit(ReceiptAnchored {
                dao_id,
                dataset_id,
                shelby_receipt_hash,
                reader: signer::address_of(reader),
                amount,
                timestamp: now,
            });
        };
    }

    /// Distribute revenue for a dataset read event.
    /// Now includes dao_id. Treasury address comes from the DistributionStore
    /// (future: could be overridden per-DAO).
    public entry fun distribute_revenue(
        payer: &signer,
        contract_addr: address,
        dao_id: vector<u8>,
        dataset_id: vector<u8>,
        shelby_receipt_hash: vector<u8>,
        amount: u64,
        contributor_addrs: vector<address>,
        contributor_weights: vector<u64>,
        curator_addrs: vector<address>,
        curator_powers: vector<u64>,
    ) acquires DistributionStore {
        assert!(amount > 0, E_ZERO_AMOUNT);

        let store = borrow_global_mut<DistributionStore>(contract_addr);
        // Receipt must have been anchored first
        assert!(table::contains(&store.anchors, shelby_receipt_hash), E_RECEIPT_NOT_ANCHORED);
        assert!(
            !table::contains(&store.records, shelby_receipt_hash),
            E_ALREADY_DISTRIBUTED,
        );

        let contributor_amount = amount * CONTRIBUTOR_BPS / 100;
        let curator_amount = amount * CURATOR_BPS / 100;
        let treasury_amount = amount - contributor_amount - curator_amount;

        // ── Pay contributors ─────────────────────────────────────────────────
        let total_weight = sum_u64(&contributor_weights);
        if (total_weight > 0) {
            let i = 0;
            while (i < vector::length(&contributor_addrs)) {
                let w = *vector::borrow(&contributor_weights, i);
                let share = contributor_amount * w / total_weight;
                if (share > 0) {
                    coin::transfer<AptosCoin>(payer, *vector::borrow(&contributor_addrs, i), share);
                };
                i = i + 1;
            };
        };

        // ── Pay curators ─────────────────────────────────────────────────────
        let total_power = sum_u64(&curator_powers);
        if (total_power > 0) {
            let j = 0;
            while (j < vector::length(&curator_addrs)) {
                let p = *vector::borrow(&curator_powers, j);
                let share = curator_amount * p / total_power;
                if (share > 0) {
                    coin::transfer<AptosCoin>(payer, *vector::borrow(&curator_addrs, j), share);
                };
                j = j + 1;
            };
        };

        // ── Pay treasury ─────────────────────────────────────────────────────
        coin::transfer<AptosCoin>(payer, store.treasury, treasury_amount);

        let now = timestamp::now_microseconds();
        table::add(&mut store.records, shelby_receipt_hash, DistributionRecord {
            dao_id,
            dataset_id,
            total_amount: amount,
            timestamp: now,
        });

        event::emit(RevenueDistributed {
            dao_id,
            dataset_id,
            shelby_receipt_hash,
            total_amount: amount,
            contributor_amount,
            curator_amount,
            treasury_amount,
            timestamp: now,
        });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    fun sum_u64(v: &vector<u64>): u64 {
        let total = 0u64;
        let i = 0;
        while (i < vector::length(v)) {
            total = total + *vector::borrow(v, i);
            i = i + 1;
        };
        total
    }
}
