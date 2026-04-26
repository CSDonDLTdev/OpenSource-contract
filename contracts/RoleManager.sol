pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

contract RoleManager is AccessControlUpgradeable {
    bytes32 public constant ISIN_WL_MANAGER = keccak256("ISIN_WL_MANAGER");
    bytes32 public constant INVESTOR_WL_MANAGER = keccak256("INVESTOR_WL_MANAGER");
    bytes32 public constant ISIN_MINT_BURN_MANAGER = keccak256("ISIN_MINT_BURN_MANAGER");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    error UnauthorizedAccount(address caller, bytes32 role);

    function grantRole(bytes32 role, address account) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        super.revokeRole(role, account);
    }

}
