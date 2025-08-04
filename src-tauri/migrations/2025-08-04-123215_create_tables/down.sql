-- Drop payments table and index
DROP TABLE IF EXISTS `payment`;

-- Drop contract_unit table and composite index
DROP INDEX IF EXISTS `idx_contract_unit_composite_id`;
DROP TABLE IF EXISTS `contract_unit`;

-- Drop contracts table and its indexes
DROP INDEX IF EXISTS `idx_contract_id`;
DROP INDEX IF EXISTS `idx_contract_gov_id`;
DROP TABLE IF EXISTS `contract`;

-- Drop tenants table and its indexes
DROP INDEX IF EXISTS `idx_tenant_id`;
DROP INDEX IF EXISTS `idx_tenant_iqama`;
DROP INDEX IF EXISTS `idx_tenant_phone`;
DROP TABLE IF EXISTS `tenant`;

-- Drop units table and index
DROP INDEX IF EXISTS `idx_unit_id`;
DROP TABLE IF EXISTS `unit`;

-- Drop complexes table and indexes
DROP INDEX IF EXISTS `idx_complex_id`;
DROP INDEX IF EXISTS `idx_complex_name`;
DROP TABLE IF EXISTS `complex`;

