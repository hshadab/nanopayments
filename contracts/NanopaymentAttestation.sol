// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title NanopaymentAttestation
/// @notice Single-purpose attestation registry: a seller asserts that a
///         Circle Nanopayment it just settled was authorized by a
///         Preflight ZK proof. One write per (proofId, seller) pair.
///
///         The record stores only hashes — no policy contents, no PII —
///         so anyone can independently verify "this proofId was used to
///         authorize this on-chain payment by this seller" without
///         needing access to ICME or the buyer's wallet.
///
/// @dev    Deployed on Arc Testnet (chainId 5042002):
///         0x76ce30319c561beaa6dcf936017fcbb1e84b18b1
///         Explorer: https://explorer.testnet.arc.network/address/0x76ce30319c561beaa6dcf936017fcbb1e84b18b1
contract NanopaymentAttestation {

    /// @dev Result codes for the off-chain Preflight check.
    uint8 constant RESULT_UNSAT = 0;
    uint8 constant RESULT_SAT   = 1;

    struct Attestation {
        bytes32 proofId;       // ICME Preflight proof_id (keccak256 of UUID string)
        bytes32 policyHash;    // ICME policy_hash (compiled SMT policy fingerprint)
        bytes32 paymentTxHash; // Arc Gateway settlement tx (0x0 if UNSAT / blocked)
        uint8   result;        // RESULT_SAT or RESULT_UNSAT
        address seller;        // msg.sender at attestation time
        uint256 timestamp;     // block.timestamp at attestation time
    }

    /// @dev proofId => attestation. Single-use: cannot be overwritten.
    mapping(bytes32 => Attestation) private _attestations;

    /// @dev seller => list of proofIds attested by that seller, in order.
    mapping(address => bytes32[]) private _sellerProofs;

    /// @dev Total count of attestations across all sellers.
    uint256 public totalAttestations;

    event ProofAttested(
        bytes32 indexed proofId,
        bytes32 indexed policyHash,
        address indexed seller,
        uint8   result,
        bytes32 paymentTxHash,
        uint256 timestamp
    );

    error AlreadyAttested(bytes32 proofId);
    error InvalidResult(uint8 result);
    error ZeroProofId();

    /// @notice Record that a Preflight proof authorized a Nanopayment.
    /// @dev    Reverts if the proofId has already been attested (single-use).
    /// @param  proofId        keccak256 hash of the ICME proof UUID
    /// @param  policyHash     ICME policy_hash returned by checkIt
    /// @param  paymentTxHash  Arc Gateway settlement tx hash; 0x0 for UNSAT
    /// @param  result         RESULT_SAT (1) or RESULT_UNSAT (0)
    function attest(
        bytes32 proofId,
        bytes32 policyHash,
        bytes32 paymentTxHash,
        uint8   result
    ) external {
        if (proofId == bytes32(0)) revert ZeroProofId();
        if (result > RESULT_SAT) revert InvalidResult(result);
        if (_attestations[proofId].timestamp != 0) revert AlreadyAttested(proofId);

        _attestations[proofId] = Attestation({
            proofId:       proofId,
            policyHash:    policyHash,
            paymentTxHash: paymentTxHash,
            result:        result,
            seller:        msg.sender,
            timestamp:     block.timestamp
        });

        _sellerProofs[msg.sender].push(proofId);
        unchecked { totalAttestations += 1; }

        emit ProofAttested(
            proofId,
            policyHash,
            msg.sender,
            result,
            paymentTxHash,
            block.timestamp
        );
    }

    /// @notice Read a single attestation by proofId.
    /// @return The Attestation struct; `timestamp == 0` means no record exists.
    function getAttestation(bytes32 proofId)
        external
        view
        returns (Attestation memory)
    {
        return _attestations[proofId];
    }

    /// @notice Check if a proofId has been attested.
    function isAttested(bytes32 proofId) external view returns (bool) {
        return _attestations[proofId].timestamp != 0;
    }

    /// @notice Total number of attestations made by a given seller.
    function sellerAttestationCount(address seller)
        external
        view
        returns (uint256)
    {
        return _sellerProofs[seller].length;
    }

    /// @notice Page through a seller's attestation history.
    /// @param  seller  address that wrote the attestations
    /// @param  offset  index to start at
    /// @param  limit   maximum number of proofIds to return
    function sellerProofs(address seller, uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory)
    {
        bytes32[] storage all = _sellerProofs[seller];
        uint256 total = all.length;
        if (offset >= total) return new bytes32[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 size = end - offset;

        bytes32[] memory page = new bytes32[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = all[offset + i];
        }
        return page;
    }
}
