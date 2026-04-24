pragma solidity ^0.8.24;

import {RoleManager} from "./RoleManager.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ISINWhiteList is OwnableUpgradeable {
    address private beacon;
    address private roleManagerAddress;
    RoleManager public roleManager;
    address private investorWhitelistAddress;

    struct ISINDetails {
        address addr;
        string isin;
        string isinType;
        string name;
        string shortName;
        string issuerName;
        string issuerCode;
        string cfi;
        bool blocked;
        bool deleted;
    }

    ISINDetails[] private whiteList;
    mapping(string => uint256) private isinIndex;

    event CreateIsin(string isin, address indexed addr, string isinType, string name, string shortName, string issuerName, string issuerCode, string cfi);
    event ModifyIsinAttributes(string isin, address indexed addr, string isinType, string name, string shortName, string issuerName, string issuerCode, string cfi);
    event DeleteIsin(string isin, address indexed addr);
    event BlockIsin(string isin, address indexed addr);
    event UnblockIsin(string isin, address indexed addr);


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _roleManager, address _beacon, address _investorWhitelist) public initializer {
        __Ownable_init(msg.sender);
        beacon = _beacon;
        roleManagerAddress = _roleManager;
        roleManager = RoleManager(_roleManager);
        investorWhitelistAddress = _investorWhitelist;
    }

    modifier onlyManagementApi() {
        if (!roleManager.hasRole(roleManager.ISIN_WL_MANAGER(), _msgSender())) {
            revert RoleManager.UnauthorizedAccount(_msgSender(), roleManager.ISIN_WL_MANAGER());
        }
        _;
    }

    error IsinNotFound();
    error IsinAlreadyExists();
    error IsinBlocked();
    error IsinNonZeroTotalSupply(address token, uint256 totalSupply);

    function _isinExists(string memory isin) internal view returns (bool) {
        // isinIndex[isin] returns 0 both if isin is not found in the mapping and if isinIndex[isin] == 0, so we need to check which case it is
        return isinIndex[isin] != 0 || (whiteList.length > 0 && keccak256(bytes(whiteList[0].isin)) == keccak256(bytes(isin)) && !whiteList[0].deleted);
    }

    function _assertIsinExists(string memory isin) internal view {
        if (!_isinExists(isin)) {
            revert IsinNotFound();
        }
    }

    function _assertIsinNotExists(string memory isin) internal view {
        if (_isinExists(isin)) {
            revert IsinAlreadyExists();
        }
    }

    function _assertZeroTotalSupply(string memory isin) internal view {
        address token = whiteList[isinIndex[isin]].addr;
        uint256 totalSupply = IERC20(token).totalSupply();
        if (totalSupply > 0) {
            revert IsinNonZeroTotalSupply(token, totalSupply);
        }
    }

    function addIsin(
        string memory isin,
        string memory isinType,
        string memory name,
        string memory shortName,
        string memory issuerName,
        string memory issuerCode,
        string memory cfi
    ) public onlyManagementApi {
        _assertIsinNotExists(isin);
        BeaconProxy newContract = new BeaconProxy(beacon, abi.encodeWithSignature("initialize(string,string,address,address,address,address)", isin, isin, msg.sender, roleManagerAddress, investorWhitelistAddress, address(this)));

        whiteList.push(ISINDetails({
            addr: address(newContract),
            isin: isin,
            isinType: isinType,
            name: name,
            shortName: shortName,
            issuerName: issuerName,
            issuerCode: issuerCode,
            cfi: cfi,
            blocked: false,
            deleted: false
        }));
        isinIndex[isin] = whiteList.length - 1;

        emit CreateIsin(isin, address(newContract), isinType, name, shortName, issuerName, issuerCode, cfi);
    }

    function modifyIsinAttributes(
        string memory isin,
        string memory isinType,
        string memory name,
        string memory shortName,
        string memory issuerName,
        string memory issuerCode,
        string memory cfi
    ) public onlyManagementApi {
        _assertIsinExists(isin);

        uint256 index = isinIndex[isin];
        ISINDetails storage details = whiteList[index];

        details.isinType = isinType;
        details.name = name;
        details.shortName = shortName;
        details.issuerName = issuerName;
        details.issuerCode = issuerCode;
        details.cfi = cfi;

        emit ModifyIsinAttributes(isin, details.addr, isinType, name, shortName, issuerName, issuerCode, cfi);
    }

    function removeIsin(string memory isin) public onlyManagementApi {
        _assertIsinExists(isin);
        _assertZeroTotalSupply(isin);
        address addr = whiteList[isinIndex[isin]].addr;
        whiteList[isinIndex[isin]].deleted = true;
        delete isinIndex[isin];

        emit DeleteIsin(isin, addr);
    }

    function blockIsin(string memory isin) public onlyManagementApi {
        _assertIsinExists(isin);
        whiteList[isinIndex[isin]].blocked = true;

        emit BlockIsin(isin, whiteList[isinIndex[isin]].addr);
    }

    function unblockIsin(string memory isin) public onlyManagementApi {
        _assertIsinExists(isin);
        whiteList[isinIndex[isin]].blocked = false;

        emit UnblockIsin(isin, whiteList[isinIndex[isin]].addr);
    }

    function listIsins() public view returns (ISINDetails[] memory) {
        return whiteList;
    }

    function isIsinBlocked(string memory isin) public view returns (bool) {
        _assertIsinExists(isin);
        return whiteList[isinIndex[isin]].blocked;
    }

    function assertTransferAllowed(string memory isin) public view returns (string memory) {
        //returns isin type for investor check
        if (isIsinBlocked(isin)) {
            revert IsinBlocked();
        }
        return whiteList[isinIndex[isin]].isinType;
    }
}
