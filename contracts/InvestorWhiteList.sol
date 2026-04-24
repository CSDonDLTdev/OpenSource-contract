pragma solidity ^0.8.24;

import {RoleManager} from "./RoleManager.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract InvestorWhiteList is OwnableUpgradeable {
    address private roleManagerAddress;
    RoleManager public roleManager;

    struct InvestorDetails {
        address wallet;
        string investorType;
        string[] allowedIsinTypes;
        bool blocked;
        bool deleted;
    }

    InvestorDetails[] private whiteList;
    mapping(address => uint256) private investorIndex;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _roleManager) public initializer {
        __Ownable_init(msg.sender);
        roleManagerAddress = _roleManager;
        roleManager = RoleManager(_roleManager);
    }

    modifier onlyManagementApi() {
        if (!roleManager.hasRole(roleManager.INVESTOR_WL_MANAGER(), _msgSender())) {
            revert RoleManager.UnauthorizedAccount(_msgSender(), roleManager.INVESTOR_WL_MANAGER());
        }
        _;
    }

    error InvestorNotFound(address wallet);
    error InvestorAlreadyExists(address wallet);
    error InvestorBlocked(address wallet);
    error IsinTypeNotAllowedForInvestor(address wallet);

    function _investorExists(address wallet) internal view returns (bool) {
        // investorIndex[wallet] returns 0 both if wallet is not found in the mapping and if investorIndex[wallet] == 0, so we need to check which case it is
        return investorIndex[wallet] != 0 || ((whiteList.length > 0 && whiteList[0].wallet == wallet) && !whiteList[0].deleted);
    }

    function _getIsinTypeAllowedIndex(address wallet, string memory isinType) internal view returns (int256) {
        string[] storage allowedIsinTypes = whiteList[investorIndex[wallet]].allowedIsinTypes;
        for (uint i = 0; i < allowedIsinTypes.length; i++) {
            if (keccak256(bytes(allowedIsinTypes[i])) == keccak256(bytes(isinType))) {
                return int(i);
            }
        }
        return - 1;
    }

    function _assertInvestorExists(address wallet) internal view {
        if (!_investorExists(wallet)) {
            revert InvestorNotFound(wallet);
        }
    }

    function _assertInvestorNotBlocked(address wallet) internal view {
        _assertInvestorExists(wallet);
        if (whiteList[investorIndex[wallet]].blocked) {
            revert InvestorBlocked(wallet);
        }
    }

    function _assertInvestorNotExists(address wallet) internal view {
        if (_investorExists(wallet)) {
            revert InvestorAlreadyExists(wallet);
        }
    }

    function addInvestor(
        address wallet,
        string memory investorType
    ) public onlyManagementApi {
        _assertInvestorNotExists(wallet);
        InvestorDetails storage investor = whiteList.push();
        investor.wallet = wallet;
        investor.investorType = investorType;
        investorIndex[wallet] = whiteList.length - 1;
    }

    function modifyInvestorAttributes(
        address wallet,
        string memory investorType
    ) public onlyManagementApi {
        _assertInvestorExists(wallet);

        uint256 index = investorIndex[wallet];
        whiteList[index].investorType = investorType;
    }

    function removeInvestor(address wallet) public onlyManagementApi {
        _assertInvestorExists(wallet);
        whiteList[investorIndex[wallet]].deleted = true;
        delete investorIndex[wallet];
    }

    function blockInvestor(address wallet) public onlyManagementApi {
        _assertInvestorExists(wallet);
        whiteList[investorIndex[wallet]].blocked = true;
    }

    function unblockInvestor(address wallet) public onlyManagementApi {
        _assertInvestorExists(wallet);
        whiteList[investorIndex[wallet]].blocked = false;
    }


    function addAllowedIsinType(address wallet, string memory isinType) public onlyManagementApi {
        if (!isIsinTypeAllowed(wallet, isinType)) {
            whiteList[investorIndex[wallet]].allowedIsinTypes.push(isinType); // Add the string if it doesn't exist
        }
    }

    function removeAllowedIsinType(address wallet, string memory isinType) public onlyManagementApi {
        _assertInvestorExists(wallet);
        int256 isinTypeIndex = _getIsinTypeAllowedIndex(wallet, isinType);
        if (isinTypeIndex == - 1) {
            return;
        }
        string[] storage allowedIsinTypes = whiteList[investorIndex[wallet]].allowedIsinTypes;
        string[] memory newAllowedIsinTypes = new string[](allowedIsinTypes.length - 1);

        uint j = 0;
        for (uint i = 0; i < allowedIsinTypes.length; i++) {
            if (i != uint(isinTypeIndex)) {
                newAllowedIsinTypes[j] = allowedIsinTypes[i];
                j++;
            }
        }

        whiteList[investorIndex[wallet]].allowedIsinTypes = newAllowedIsinTypes;
    }

    function listInvestors() public view returns (InvestorDetails[] memory) {
        return whiteList;
    }

    function getInvestor(address wallet) public view returns (InvestorDetails memory) {
        _assertInvestorExists(wallet);
        return whiteList[investorIndex[wallet]];
    }

    function isInvestorBlocked(address wallet) public view returns (bool) {
        _assertInvestorExists(wallet);
        return whiteList[investorIndex[wallet]].blocked;
    }

    function isIsinTypeAllowed(address wallet, string memory isinType) public view returns (bool) {
        _assertInvestorExists(wallet);
        return _getIsinTypeAllowedIndex(wallet, isinType) >= 0;
    }

    function assertTransferAllowed(address wallet, string memory isinType) public view {
        _assertInvestorNotBlocked(wallet);
        int256 isinTypeIndex = _getIsinTypeAllowedIndex(wallet, isinType);
        if (isinTypeIndex == - 1) {
            revert IsinTypeNotAllowedForInvestor(wallet);
        }
    }
}
