// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EscrowVault {
    struct Deal {
        uint256 amount;
        address payer;
        address recipientIfTrue;
        address recipientIfFalse;
        uint64 timeout;
        bool funded;
        bool settled;
        bool refunded;
        bool releasedToTrue;
        uint256 settledAmount;
        bytes32 attestationHash;
    }

    bytes32 private constant _SETTLEMENT_TYPEHASH =
        keccak256("Settlement(bytes32 dealHash,bool verdict,bytes32 attestationHash,uint256 nonce)");

    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant _NAME_HASH = keccak256("TheRoomEscrowVault");
    bytes32 private constant _VERSION_HASH = keccak256("1");

    address public immutable verifier;

    mapping(bytes32 => Deal) private _deals;
    mapping(bytes32 => uint256) public settlementNonces;

    event DealFunded(
        bytes32 indexed dealHash,
        address indexed payer,
        uint256 amount,
        address recipientIfTrue,
        address recipientIfFalse,
        uint64 timeout
    );

    event DealSettled(
        bytes32 indexed dealHash,
        bool verdict,
        address indexed recipient,
        uint256 amount,
        bytes32 attestationHash,
        uint256 nonce
    );

    event DealRefunded(bytes32 indexed dealHash, address indexed payer, uint256 amount);

    error InvalidVerifier();
    error InvalidDealConfig();
    error DealAlreadyFunded();
    error DealNotFunded();
    error DealAlreadyClosed();
    error TimeoutNotReached();
    error InvalidSignature();
    error ValueTransferFailed();

    constructor(address verifier_) {
        if (verifier_ == address(0)) revert InvalidVerifier();
        verifier = verifier_;
    }

    function fundDeal(
        bytes32 dealHash,
        address recipientIfTrue,
        address recipientIfFalse,
        uint64 timeout
    ) external payable {
        if (dealHash == bytes32(0)) revert InvalidDealConfig();
        if (msg.value == 0) revert InvalidDealConfig();
        if (recipientIfTrue == address(0) || recipientIfFalse == address(0)) revert InvalidDealConfig();
        if (timeout <= block.timestamp) revert InvalidDealConfig();

        Deal storage deal = _deals[dealHash];
        if (deal.funded) revert DealAlreadyFunded();

        deal.amount = msg.value;
        deal.payer = msg.sender;
        deal.recipientIfTrue = recipientIfTrue;
        deal.recipientIfFalse = recipientIfFalse;
        deal.timeout = timeout;
        deal.funded = true;

        emit DealFunded(dealHash, msg.sender, msg.value, recipientIfTrue, recipientIfFalse, timeout);
    }

    function settleDeal(
        bytes32 dealHash,
        bool verdict,
        bytes32 attestationHash,
        bytes calldata signature
    ) external {
        Deal storage deal = _deals[dealHash];
        if (!deal.funded) revert DealNotFunded();
        if (deal.settled || deal.refunded) revert DealAlreadyClosed();

        uint256 nonce = settlementNonces[dealHash];
        bytes32 digest = _settlementDigest(dealHash, verdict, attestationHash, nonce);
        address recovered = _recoverSigner(digest, signature);
        if (recovered != verifier) revert InvalidSignature();

        settlementNonces[dealHash] = nonce + 1;

        address recipient = verdict ? deal.recipientIfTrue : deal.recipientIfFalse;
        uint256 amount = deal.amount;

        deal.settled = true;
        deal.releasedToTrue = verdict;
        deal.settledAmount = amount;
        deal.attestationHash = attestationHash;

        (bool sent, ) = payable(recipient).call{value: amount}("");
        if (!sent) revert ValueTransferFailed();

        emit DealSettled(dealHash, verdict, recipient, amount, attestationHash, nonce);
    }

    function refundAfterTimeout(bytes32 dealHash) external {
        Deal storage deal = _deals[dealHash];
        if (!deal.funded) revert DealNotFunded();
        if (deal.settled || deal.refunded) revert DealAlreadyClosed();
        if (block.timestamp < deal.timeout) revert TimeoutNotReached();

        deal.refunded = true;
        uint256 amount = deal.amount;

        (bool sent, ) = payable(deal.payer).call{value: amount}("");
        if (!sent) revert ValueTransferFailed();

        emit DealRefunded(dealHash, deal.payer, amount);
    }

    function getDeal(bytes32 dealHash)
        external
        view
        returns (
            uint256 amount,
            address payer,
            address recipientIfTrue,
            address recipientIfFalse,
            uint64 timeout,
            bool funded,
            bool settled,
            bool refunded,
            bool releasedToTrue,
            uint256 settledAmount,
            bytes32 attestationHash,
            uint256 nonce
        )
    {
        Deal memory deal = _deals[dealHash];
        return (
            deal.amount,
            deal.payer,
            deal.recipientIfTrue,
            deal.recipientIfFalse,
            deal.timeout,
            deal.funded,
            deal.settled,
            deal.refunded,
            deal.releasedToTrue,
            deal.settledAmount,
            deal.attestationHash,
            settlementNonces[dealHash]
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    function settlementDigest(
        bytes32 dealHash,
        bool verdict,
        bytes32 attestationHash,
        uint256 nonce
    ) external view returns (bytes32) {
        return _settlementDigest(dealHash, verdict, attestationHash, nonce);
    }

    function _settlementDigest(
        bytes32 dealHash,
        bool verdict,
        bytes32 attestationHash,
        uint256 nonce
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(_SETTLEMENT_TYPEHASH, dealHash, verdict, attestationHash, nonce)
        );

        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(_DOMAIN_TYPEHASH, _NAME_HASH, _VERSION_HASH, block.chainid, address(this))
        );
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v < 27) {
            v += 27;
        }

        if (v != 27 && v != 28) return address(0);

        return ecrecover(digest, v, r, s);
    }
}
