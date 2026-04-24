pragma solidity ^0.8.24;

import {ISINWhiteList} from "./ISINWhiteList.sol";
import {InvestorWhiteList} from "./InvestorWhiteList.sol";
import {RoleManager} from "./RoleManager.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";

contract IsinPermit is OwnableUpgradeable, ERC20Upgradeable, EIP712Upgradeable, NoncesUpgradeable {
    RoleManager public roleManager;
    ISINWhiteList public isinWhitelist;
    InvestorWhiteList public investorWhitelist;

    bytes32 private constant TRANSFER_PERMIT_TYPEHASH =
    keccak256("Transfer(address owner,address to,uint256 value,uint256 customvalue,uint256 nonce,uint256 deadline)");
    bytes32 private constant APPROVE_PERMIT_TYPEHASH =
    keccak256("Approve(address owner,address to,address deposit,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 private constant BURN_PERMIT_TYPEHASH =
    keccak256("Burn(address owner,uint256 value,uint256 nonce,uint256 deadline)");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    error ERC2612ExpiredSignature(uint256 deadline);
    error ERC2612InvalidSigner(address signer, address owner);

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function initialize(string memory name_, string memory symbol_, address owner, address _roleManager, address _investorWhitelist, address _isinWhitelist) public initializer {
        __Ownable_init(owner);
        __EIP712_init_unchained(name_, "1");
        __ERC20_init(name_, symbol_);
        roleManager = RoleManager(_roleManager);
        investorWhitelist = InvestorWhiteList(_investorWhitelist);
        isinWhitelist = ISINWhiteList(_isinWhitelist);
    }

    error InvalidTransferValue(uint256 value);

    event IsinTransfer(address indexed from, address indexed to, uint256 value, uint256 customValue);
    event IsinDltTransfer(address indexed from, address indexed to, uint256 value);

    modifier onlyManagementApi() {
        if (!roleManager.hasRole(roleManager.ISIN_MINT_BURN_MANAGER(), _msgSender())) {
            revert RoleManager.UnauthorizedAccount(_msgSender(), roleManager.ISIN_MINT_BURN_MANAGER());
        }
        _;
    }

    function _verifySignature(uint8 v, bytes32 r, bytes32 s, uint256 deadline, bytes32 structHash, address expectedSigner) internal view {
        if (block.timestamp > deadline) {
            revert ERC2612ExpiredSignature(deadline);
        }

        bytes32 hash = _hashTypedDataV4(structHash);

        address signer = ECDSA.recover(hash, v, r, s);
        if (signer != expectedSigner) {
            revert ERC2612InvalidSigner(signer, expectedSigner);
        }
    }

    function mint(address account, uint256 value) external onlyManagementApi {
        string memory isinType = isinWhitelist.assertTransferAllowed(name());
        investorWhitelist.assertTransferAllowed(account, isinType);
        _mint(account, value);

        emit IsinDltTransfer(address(0),account, value);
    }

    function burn(address account, uint256 value) external onlyManagementApi {
        _burn(account, value);

        emit IsinDltTransfer(account, address(0), value);
    }

    function assertTransferAllowed(address from, address to, uint256 value, address deposit) public view {
        assertTransferAllowed(from, to, value);
        uint allowance = allowance(from, deposit);
        if (allowance < value) {
            revert ERC20InsufficientAllowance(deposit, allowance, value);
        }
    }

    function assertTransferAllowed(address from, address to, uint256 value) public view {
        if (value == 0) {
            revert InvalidTransferValue(value);
        }
        assertTransferAllowed(from, to);
        uint fromBalance = balanceOf(from);
        if (fromBalance < value) {
            revert ERC20InsufficientBalance(from, fromBalance, value);
        }
    }

    function assertTransferAllowed(address from, uint256 value) internal view {
        if (value == 0) {
            revert InvalidTransferValue(value);
        }
        string memory isinType = isinWhitelist.assertTransferAllowed(name());
        investorWhitelist.assertTransferAllowed(from, isinType);
        uint fromBalance = balanceOf(from);
        if (fromBalance < value) {
            revert ERC20InsufficientBalance(from, fromBalance, value);
        }
    }

    function assertTransferAllowed(address from, address to) public view {
        string memory isinType = isinWhitelist.assertTransferAllowed(name());
        investorWhitelist.assertTransferAllowed(from, isinType);
        investorWhitelist.assertTransferAllowed(to, isinType);
    }

    function transferPermit(
        address owner,
        address to,
        uint256 value,
        uint256 customValue,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual {
        bytes32 structHash = keccak256(abi.encode(TRANSFER_PERMIT_TYPEHASH,
            owner, to, value, customValue, _useNonce(owner), deadline));
        _verifySignature(v, r, s, deadline, structHash, owner);

        assertTransferAllowed(owner, to, value);
        _transfer(owner, to, value);

        emit IsinTransfer(owner, to, value, customValue);
    }

    function approvePermit(
        address owner,
        address to,
        address deposit,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual {
        bytes32 structHash = keccak256(abi.encode(APPROVE_PERMIT_TYPEHASH,
            owner, to, deposit, value, _useNonce(owner), deadline));
        _verifySignature(v, r, s, deadline, structHash, owner);

        assertTransferAllowed(owner, to, value);
        _approve(owner, deposit, value);
    }

    function burnPermit(
        address owner,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual {
        bytes32 structHash = keccak256(abi.encode(BURN_PERMIT_TYPEHASH,
            owner, value, _useNonce(owner), deadline));
        _verifySignature(v, r, s, deadline, structHash, owner);

        assertTransferAllowed(owner, value);
        _burn(owner, value);

        emit IsinDltTransfer(owner, address(0), value);
    }

    function DOMAIN_SEPARATOR() external view virtual returns (bytes32) {
        return _domainSeparatorV4();
    }
}