// @generated automatically by Diesel CLI.

diesel::table! {
    complex (id) {
        id -> Integer,
        name -> Text,
        location -> Text,
    }
}

diesel::table! {
    contract (id) {
        id -> Integer,
        gov_id -> Nullable<Text>,
        status -> Text,
        start_date -> Integer,
        end_date -> Integer,
        interval_in_months -> Integer,
        cost_per_interval -> Float,
        tenant_id -> Integer,
    }
}

diesel::table! {
    contract_unit (rowid) {
        rowid -> Integer,
        contract_id -> Integer,
        unit_id -> Integer,
    }
}

diesel::table! {
    payment (id) {
        id -> Integer,
        date -> Integer,
        amount -> Float,
        contract_id -> Integer,
    }
}

diesel::table! {
    tenant (id) {
        id -> Integer,
        iqama -> Text,
        name -> Text,
        phone -> Text,
    }
}

diesel::table! {
    unit (id) {
        id -> Integer,
        name -> Text,
        status -> Text,
        complex_id -> Integer,
    }
}

diesel::allow_tables_to_appear_in_same_query!(
    complex,
    contract,
    contract_unit,
    payment,
    tenant,
    unit,
);
