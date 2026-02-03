use std::fmt::Display;

use diesel::{
    deserialize::{FromSql, FromSqlRow},
    expression::AsExpression,
    prelude::*,
    serialize::ToSql,
};

#[derive(Queryable, Identifiable, Selectable, Debug, PartialEq)]
#[diesel(table_name = crate::schema::complex)]
pub struct Complex {
    pub id: i32,
    pub name: String,
    pub location: String,
}

#[derive(FromSqlRow, AsExpression, Debug, PartialEq, Clone)]
#[diesel(sql_type = diesel::sql_types::Text)]
pub enum UnitStatus {
    Occupied,
    Vacant,
}

impl Display for UnitStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UnitStatus::Occupied => write!(f, "occupied"),
            UnitStatus::Vacant => write!(f, "vacant"),
        }
    }
}

impl TryFrom<&str> for UnitStatus {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "occupied" => Ok(UnitStatus::Occupied),
            "vacant" => Ok(UnitStatus::Vacant),
            _ => Err(format!("unknown unit status: {}", value)),
        }
    }
}

impl FromSql<diesel::sql_types::Text, diesel::sqlite::Sqlite> for UnitStatus {
    fn from_sql(
        bytes: <diesel::sqlite::Sqlite as diesel::backend::Backend>::RawValue<'_>,
    ) -> diesel::deserialize::Result<Self> {
        let t =
            <String as FromSql<diesel::sql_types::Text, diesel::sqlite::Sqlite>>::from_sql(bytes)?;
        Ok(t.as_str().try_into()?)
    }
}

impl ToSql<diesel::sql_types::Text, diesel::sqlite::Sqlite> for UnitStatus {
    fn to_sql<'b>(
        &'b self,
        out: &mut diesel::serialize::Output<'b, '_, diesel::sqlite::Sqlite>,
    ) -> diesel::serialize::Result {
        out.set_value(self.to_string());
        Ok(diesel::serialize::IsNull::No)
    }
}

#[derive(Queryable, Identifiable, Selectable, Associations, Debug, PartialEq)]
#[diesel(table_name = crate::schema::unit)]
#[diesel(belongs_to(Complex))]
pub struct Unit {
    pub id: i32,
    pub name: String,
    pub status: UnitStatus,
    pub complex_id: i32,
}

#[derive(Queryable, Identifiable, Selectable, Debug, PartialEq)]
#[diesel(table_name = crate::schema::tenant)]
pub struct Tenant {
    pub id: i32,
    pub iqama: String,
    pub name: String,
    pub phone: String,
}

#[derive(FromSqlRow, AsExpression, Debug, PartialEq, Clone)]
#[diesel(sql_type = diesel::sql_types::Text)]
pub enum ContractStatus {
    Active,
    Terminated,
    Expired,
    Defaulted,
}

impl Display for ContractStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ContractStatus::Active => write!(f, "active"),
            ContractStatus::Terminated => write!(f, "terminated"),
            ContractStatus::Expired => write!(f, "expired"),
            ContractStatus::Defaulted => write!(f, "defaulted"),
        }
    }
}

impl TryFrom<&str> for ContractStatus {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "active" => Ok(ContractStatus::Active),
            "terminated" => Ok(ContractStatus::Terminated),
            "expired" => Ok(ContractStatus::Expired),
            "defaulted" => Ok(ContractStatus::Defaulted),
            _ => Err(format!("unknown contract status: {}", value)),
        }
    }
}

impl FromSql<diesel::sql_types::Text, diesel::sqlite::Sqlite> for ContractStatus {
    fn from_sql(
        bytes: <diesel::sqlite::Sqlite as diesel::backend::Backend>::RawValue<'_>,
    ) -> diesel::deserialize::Result<Self> {
        let t =
            <String as FromSql<diesel::sql_types::Text, diesel::sqlite::Sqlite>>::from_sql(bytes)?;
        Ok(t.as_str().try_into()?)
    }
}

impl ToSql<diesel::sql_types::Text, diesel::sqlite::Sqlite> for ContractStatus {
    fn to_sql<'b>(
        &'b self,
        out: &mut diesel::serialize::Output<'b, '_, diesel::sqlite::Sqlite>,
    ) -> diesel::serialize::Result {
        out.set_value(self.to_string());
        Ok(diesel::serialize::IsNull::No)
    }
}

#[derive(FromSqlRow, AsExpression, Debug, PartialEq, Clone)]
#[diesel(sql_type = diesel::sql_types::Integer)]
#[repr(i32)]
pub enum ContractInterval {
    Monthly = 1,
    Quarterly = 3,
    SemiAnnually = 6,
    Annually = 12,
}

impl Display for ContractInterval {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ContractInterval::Monthly => write!(f, "monthly"),
            ContractInterval::Quarterly => write!(f, "quarterly"),
            ContractInterval::SemiAnnually => write!(f, "semi-annually"),
            ContractInterval::Annually => write!(f, "annually"),
        }
    }
}

impl From<&ContractInterval> for i32 {
    fn from(value: &ContractInterval) -> Self {
        match value {
            ContractInterval::Monthly => 1,
            ContractInterval::Quarterly => 3,
            ContractInterval::SemiAnnually => 6,
            ContractInterval::Annually => 12,
        }
    }
}

impl TryFrom<i32> for ContractInterval {
    type Error = String;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(ContractInterval::Monthly),
            3 => Ok(ContractInterval::Quarterly),
            6 => Ok(ContractInterval::SemiAnnually),
            12 => Ok(ContractInterval::Annually),
            _ => Err(format!("unknown contract interval: {}", value)),
        }
    }
}

impl FromSql<diesel::sql_types::Integer, diesel::sqlite::Sqlite> for ContractInterval {
    fn from_sql(
        bytes: <diesel::sqlite::Sqlite as diesel::backend::Backend>::RawValue<'_>,
    ) -> diesel::deserialize::Result<Self> {
        let t =
            <i32 as FromSql<diesel::sql_types::Integer, diesel::sqlite::Sqlite>>::from_sql(bytes)?;
        Ok(t.try_into()?)
    }
}

impl ToSql<diesel::sql_types::Integer, diesel::sqlite::Sqlite> for ContractInterval {
    fn to_sql<'b>(
        &'b self,
        out: &mut diesel::serialize::Output<'b, '_, diesel::sqlite::Sqlite>,
    ) -> diesel::serialize::Result {
        out.set_value(i32::from(self));
        Ok(diesel::serialize::IsNull::No)
    }
}

#[derive(Queryable, Identifiable, Selectable, Associations, Debug, PartialEq)]
#[diesel(table_name = crate::schema::contract)]
#[diesel(belongs_to(Tenant))]
pub struct Contract {
    pub id: i32,
    pub gov_id: Option<String>,
    pub status: ContractStatus,
    pub start_date: i32,
    pub end_date: i32,
    pub interval_in_months: ContractInterval,
    pub cost_per_interval: f32,
    pub tenant_id: i32,
}

#[derive(Queryable, Identifiable, Selectable, Associations, Debug, PartialEq)]
#[diesel(table_name = crate::schema::contract_unit)]
#[diesel(belongs_to(Contract))]
#[diesel(belongs_to(Unit))]
#[diesel(primary_key(contract_id, unit_id))]
pub struct ContractUnit {
    pub contract_id: i32,
    pub unit_id: i32,
}

#[derive(Queryable, Identifiable, Selectable, Associations, Debug, PartialEq)]
#[diesel(table_name = crate::schema::payment)]
#[diesel(belongs_to(Contract))]
pub struct Payment {
    pub id: i32,
    pub date: i32,
    pub amount: f32,
    pub contract_id: i32,
}
