# v0.2.18
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

import hashlib
import json
import typing


class FracturedArchiveResolver(gl.Contract):
    """
    FracturedArchiveResolver

    A GenLayer-native conflict-aware archive protocol.

    Product purpose:
    Users submit conflicting versions of a record family (documents,
    screenshots, testimonies, governance posts). GenLayer validators compare
    the versions non-deterministically and reach consensus on a structured
    archival map that preserves divergence, timeline, reliability, and
    uncertainty instead of forcing one version to erase the rest.

    What belongs on-chain:
    - archive case registry
    - version registry with content hashes
    - consensus archival maps (canonical JSON, append-only history)
    - challenges with evidence hashes
    - immutable audit trail

    What should stay off-chain:
    - full documents, images, PDFs, long transcripts. Store those in
      IPFS/Arweave/storage and put URIs and hashes here.
    """

    owner: str
    paused: bool

    case_counter: u256
    version_counter: u256
    map_counter: u256
    challenge_counter: u256
    audit_counter: u256

    cases: TreeMap[str, str]                 # case_id -> case json
    case_index: TreeMap[str, str]            # "all" -> "case-1|case-2|..."

    versions: TreeMap[str, str]              # version_id -> version json
    case_version_index: TreeMap[str, str]    # case_id -> "ver-1|ver-2|..."
    case_hash_index: TreeMap[str, str]       # case_id::content_hash -> version_id

    maps: TreeMap[str, str]                  # map_id -> map json (canonical, append-only)
    case_map_index: TreeMap[str, str]        # case_id -> "map-1|map-2|..." (history preserved)

    challenges: TreeMap[str, str]            # challenge_id -> challenge json
    case_challenge_index: TreeMap[str, str]  # case_id -> "chal-1|..."

    audit_logs: TreeMap[str, str]            # audit_id -> audit json
    case_audit_index: TreeMap[str, str]      # case_id -> "AUDIT-1|..."

    ARCHIVE_TYPES: typing.ClassVar[str] = (
        "document_versions|institutional_record|community_memory|incident_account|"
        "historical_event|governance_record|legal_or_dispute_record|"
        "media_or_screenshot_record|translation_family|mixed_evidence_archive"
    )
    SOURCE_TYPES: typing.ClassVar[str] = (
        "primary_document|screenshot|transcript|audio_transcript|video_transcript|"
        "public_webpage|archive_snapshot|testimony|email_or_message_export|"
        "institutional_file|translation|unknown"
    )
    TARGET_TYPES: typing.ClassVar[str] = "version|archival_map|divergence_point"
    CHALLENGE_REASONS: typing.ClassVar[str] = (
        "fake_or_forged|wrongly_grouped|important_version_missing|bad_timeline|"
        "bad_translation_read|metadata_ignored|source_chain_wrong|bias_or_overreach|"
        "new_evidence_available|other"
    )
    MAP_STATUSES: typing.ClassVar[str] = (
        "resolved_map|partial_map|insufficient_evidence|contested_map|requires_more_versions"
    )
    UNCERTAINTY_LEVELS: typing.ClassVar[str] = "low|medium|high|irreducible"
    SEVERITIES: typing.ClassVar[str] = "minor|moderate|major|critical|unknown"
    RELIABILITY_LEVELS: typing.ClassVar[str] = "high|medium|low|unknown"
    DIVERGENCE_TYPES: typing.ClassVar[str] = (
        "added_claim|removed_claim|changed_wording|changed_date|changed_actor|"
        "changed_causality|changed_obligation|changed_tone|translation_shift|"
        "omission|contradictory_memory|metadata_conflict|authorship_conflict|"
        "source_chain_gap|possible_tampering|unclear_difference"
    )
    ARCHIVE_TREATMENTS: typing.ClassVar[str] = (
        "preserve_as_primary|preserve_as_parallel|preserve_as_later_revision|"
        "preserve_as_translation_variant|preserve_as_disputed_memory|"
        "preserve_as_low_confidence|preserve_as_possible_tampering|"
        "exclude_from_current_map|requires_more_evidence"
    )

    def __init__(self) -> None:
        self.owner = gl.message.sender_address.as_hex
        self.paused = False

        self.case_counter = u256(0)
        self.version_counter = u256(0)
        self.map_counter = u256(0)
        self.challenge_counter = u256(0)
        self.audit_counter = u256(0)

        self.cases = TreeMap()
        self.case_index = TreeMap()
        self.versions = TreeMap()
        self.case_version_index = TreeMap()
        self.case_hash_index = TreeMap()
        self.maps = TreeMap()
        self.case_map_index = TreeMap()
        self.challenges = TreeMap()
        self.case_challenge_index = TreeMap()
        self.audit_logs = TreeMap()
        self.case_audit_index = TreeMap()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _sender(self) -> str:
        return gl.message.sender_address.as_hex.lower()

    def _json(self, value: typing.Any) -> str:
        return json.dumps(value, sort_keys=True)

    def _load(self, raw: str) -> typing.Any:
        if raw is None or raw == "":
            return {}
        return json.loads(raw)

    def _require_owner(self) -> None:
        if self._sender() != self.owner.lower():
            raise gl.vm.UserError("Only contract owner")

    def _require_not_paused(self) -> None:
        if self.paused:
            raise gl.vm.UserError("Contract is paused")

    def _require_non_empty(self, value: str, field_name: str) -> None:
        if value is None or len(value.strip()) == 0:
            raise gl.vm.UserError(field_name + " is required")

    def _require_enum(self, value: str, allowed: str, field_name: str) -> str:
        cleaned = value.strip()
        for item in allowed.split("|"):
            if cleaned == item:
                return cleaned
        raise gl.vm.UserError("Invalid " + field_name + ": " + cleaned)

    def _key2(self, a: str, b: str) -> str:
        return a + "::" + b

    def _append(self, existing: str, item: str) -> str:
        if existing is None or existing == "":
            return item
        return existing + "|" + item

    def _split_ids(self, joined: str) -> typing.List[str]:
        if joined is None or joined == "":
            return []
        return joined.split("|")

    def _limit(self, value: typing.Any, max_len: int) -> str:
        text = str(value)
        if len(text) > max_len:
            return text[:max_len]
        return text

    def _to_int(self, value: typing.Any, fallback: int) -> int:
        try:
            return int(value)
        except Exception:
            return fallback

    def _bounded_score(self, value: typing.Any, fallback: int) -> int:
        score = self._to_int(value, fallback)
        if score < 0:
            return 0
        if score > 100:
            return 100
        return score

    def _to_bool(self, value: typing.Any) -> bool:
        if isinstance(value, bool):
            return value
        cleaned = str(value).strip().lower()
        return cleaned == "true" or cleaned == "1" or cleaned == "yes"

    def _normalise_hash(self, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned.startswith("sha256:"):
            return cleaned[7:]
        if cleaned.startswith("sha-256:"):
            return cleaned[8:]
        if cleaned.startswith("0x") and len(cleaned) == 66:
            return cleaned[2:]
        return cleaned

    def _sha256_hex(self, body: bytes) -> str:
        return hashlib.sha256(body).hexdigest()

    def _hash_matches(self, claimed_hash: str, actual_hash: str) -> bool:
        return self._normalise_hash(claimed_hash) == actual_hash.lower()

    def _retrievable_uri(self, uri: str) -> bool:
        cleaned = uri.strip().lower()
        return cleaned.startswith("http://") or cleaned.startswith("https://")

    def _fetch_integrity_snapshot(
        self,
        uri: str,
        claimed_hash: str,
        label: str,
    ) -> typing.Any:
        if not self._retrievable_uri(uri):
            return {
                "label": label,
                "uri": self._limit(uri, 500),
                "retrieval_status": "missing_or_unsupported_uri",
                "http_status": 0,
                "claimed_sha256": self._normalise_hash(claimed_hash),
                "computed_sha256": "",
                "hash_match": False,
                "byte_length": 0,
                "content_excerpt": "",
                "provenance_notes": "Validators could not retrieve this record from an http(s) URI.",
            }

        try:
            response = gl.nondet.web.get(uri)
            body = response.body
            if body is None:
                body = b""
            text = body.decode("utf-8", "replace")
            actual_hash = self._sha256_hex(body)
            status_code = self._to_int(response.status, 0)
            hash_match = self._hash_matches(claimed_hash, actual_hash)
            retrieval_status = "verified"
            if status_code < 200 or status_code > 299:
                retrieval_status = "http_error"
            if not hash_match:
                retrieval_status = "hash_mismatch"
            return {
                "label": label,
                "uri": self._limit(uri, 500),
                "retrieval_status": retrieval_status,
                "http_status": status_code,
                "claimed_sha256": self._normalise_hash(claimed_hash),
                "computed_sha256": actual_hash,
                "hash_match": hash_match,
                "byte_length": len(body),
                "content_excerpt": self._limit(text, 2200),
                "provenance_notes": "Fetched directly by GenLayer validators during archival mapping.",
            }
        except Exception as error:
            return {
                "label": label,
                "uri": self._limit(uri, 500),
                "retrieval_status": "retrieval_failed",
                "http_status": 0,
                "claimed_sha256": self._normalise_hash(claimed_hash),
                "computed_sha256": "",
                "hash_match": False,
                "byte_length": 0,
                "content_excerpt": "",
                "provenance_notes": self._limit("Validator retrieval failed: " + str(error), 300),
            }

    def _next_id(self, prefix: str, counter_name: str) -> str:
        if counter_name == "case":
            self.case_counter = self.case_counter + u256(1)
            return prefix + "-" + str(self.case_counter)
        if counter_name == "version":
            self.version_counter = self.version_counter + u256(1)
            return prefix + "-" + str(self.version_counter)
        if counter_name == "map":
            self.map_counter = self.map_counter + u256(1)
            return prefix + "-" + str(self.map_counter)
        if counter_name == "challenge":
            self.challenge_counter = self.challenge_counter + u256(1)
            return prefix + "-" + str(self.challenge_counter)
        if counter_name == "audit":
            self.audit_counter = self.audit_counter + u256(1)
            return prefix + "-" + str(self.audit_counter)
        raise gl.vm.UserError("Unknown counter")

    def _require_case_exists(self, case_id: str) -> typing.Any:
        raw = self.cases.get(case_id, "")
        if raw == "":
            raise gl.vm.UserError("Archive case not found")
        return self._load(raw)

    def _require_version_exists(self, version_id: str) -> typing.Any:
        raw = self.versions.get(version_id, "")
        if raw == "":
            raise gl.vm.UserError("Archive version not found")
        return self._load(raw)

    def _record_audit(
        self,
        case_id: str,
        event_type: str,
        actor: str,
        summary: str,
        data_hash: str,
        created_at: str,
    ) -> str:
        audit_id = self._next_id("AUDIT", "audit")
        entry = {
            "audit_id": audit_id,
            "case_id": case_id,
            "event_type": event_type,
            "actor": actor.lower(),
            "summary": self._limit(summary, 800),
            "data_hash": data_hash,
            "created_at": created_at,
        }
        self.audit_logs[audit_id] = self._json(entry)
        if case_id != "":
            self.case_audit_index[case_id] = self._append(
                self.case_audit_index.get(case_id, ""),
                audit_id,
            )
        return audit_id

    # ------------------------------------------------------------------
    # Owner and contract status
    # ------------------------------------------------------------------

    @gl.public.view
    def get_owner(self) -> str:
        return self.owner

    @gl.public.view
    def is_paused(self) -> bool:
        return self.paused

    @gl.public.view
    def get_contract_summary(self) -> str:
        return self._json(
            {
                "owner": self.owner,
                "paused": self.paused,
                "case_counter": str(self.case_counter),
                "version_counter": str(self.version_counter),
                "map_counter": str(self.map_counter),
                "challenge_counter": str(self.challenge_counter),
                "audit_counter": str(self.audit_counter),
            }
        )

    @gl.public.write
    def pause(self) -> None:
        self._require_owner()
        self.paused = True

    @gl.public.write
    def unpause(self) -> None:
        self._require_owner()
        self.paused = False

    # ------------------------------------------------------------------
    # Archive case management
    # ------------------------------------------------------------------

    @gl.public.write
    def create_archive_case(
        self,
        title: str,
        description: str,
        archive_type: str,
        case_context_uri: str,
        created_at: str,
    ) -> str:
        self._require_not_paused()
        self._require_non_empty(title, "title")
        self._require_non_empty(description, "description")
        final_archive_type = self._require_enum(archive_type, self.ARCHIVE_TYPES, "archive_type")

        case_id = self._next_id("case", "case")
        record = {
            "case_id": case_id,
            "title": self._limit(title.strip(), 240),
            "description": self._limit(description.strip(), 1400),
            "archive_type": final_archive_type,
            "creator": self._sender(),
            "created_at": created_at,
            "status": "open",
            "case_context_uri": self._limit(case_context_uri, 500),
            "version_count": 0,
            "latest_map_id": "",
        }
        self.cases[case_id] = self._json(record)
        self.case_index["all"] = self._append(self.case_index.get("all", ""), case_id)

        self._record_audit(
            case_id,
            "CASE_CREATED",
            self._sender(),
            "Archive case created: " + record["title"],
            case_context_uri,
            created_at,
        )
        return case_id

    @gl.public.write
    def submit_version(
        self,
        case_id: str,
        title: str,
        version_label: str,
        content_uri: str,
        content_hash: str,
        source_uri: str,
        source_type: str,
        claimed_author: str,
        claimed_date: str,
        language: str,
        metadata_uri: str,
        submitted_at: str,
    ) -> str:
        self._require_not_paused()
        self._require_non_empty(title, "title")
        self._require_non_empty(content_hash, "content_hash")
        final_source_type = self._require_enum(source_type, self.SOURCE_TYPES, "source_type")

        case = self._require_case_exists(case_id)
        if case.get("status", "") not in ["open", "mapped", "challenged"]:
            raise gl.vm.UserError("Case is not accepting versions")

        hash_key = self._key2(case_id, content_hash.strip())
        if self.case_hash_index.get(hash_key, "") != "" and metadata_uri.strip() == "":
            raise gl.vm.UserError(
                "Duplicate content_hash in this case; provide metadata_uri explaining why"
            )

        version_id = self._next_id("ver", "version")
        final_label = version_label.strip()
        if final_label == "":
            final_label = "Version " + str(self._to_int(case.get("version_count", 0), 0) + 1)

        record = {
            "version_id": version_id,
            "case_id": case_id,
            "submitter": self._sender(),
            "title": self._limit(title.strip(), 400),
            "version_label": self._limit(final_label, 140),
            "content_uri": self._limit(content_uri, 500),
            "content_hash": content_hash.strip(),
            "source_uri": self._limit(source_uri, 500),
            "source_type": final_source_type,
            "claimed_author": self._limit(claimed_author, 200),
            "claimed_date": self._limit(claimed_date, 60),
            "submitted_at": submitted_at,
            "language": self._limit(language, 40),
            "metadata_uri": self._limit(metadata_uri, 500),
            "status": "submitted",
        }
        self.versions[version_id] = self._json(record)
        self.case_version_index[case_id] = self._append(
            self.case_version_index.get(case_id, ""),
            version_id,
        )
        self.case_hash_index[hash_key] = version_id

        case["version_count"] = self._to_int(case.get("version_count", 0), 0) + 1
        self.cases[case_id] = self._json(case)

        self._record_audit(
            case_id,
            "VERSION_SUBMITTED",
            self._sender(),
            "Version locked into archive record: " + final_label,
            content_hash.strip(),
            submitted_at,
        )
        return version_id

    @gl.public.write
    def challenge_version_or_map(
        self,
        case_id: str,
        target_type: str,
        target_id: str,
        challenge_reason: str,
        explanation: str,
        evidence_uri: str,
        evidence_hash: str,
        created_at: str,
    ) -> str:
        self._require_not_paused()
        final_target_type = self._require_enum(target_type, self.TARGET_TYPES, "target_type")
        final_reason = self._require_enum(challenge_reason, self.CHALLENGE_REASONS, "challenge_reason")

        case = self._require_case_exists(case_id)
        if case.get("status", "") == "closed":
            raise gl.vm.UserError("Case is closed")

        if final_target_type == "version":
            version = self._require_version_exists(target_id)
            if version.get("case_id", "") != case_id:
                raise gl.vm.UserError("Version does not belong to this case")
            version["status"] = "flagged"
            self.versions[target_id] = self._json(version)
        if final_target_type == "archival_map" and self.maps.get(target_id, "") == "":
            raise gl.vm.UserError("Challenged map does not exist")

        challenge_id = self._next_id("chal", "challenge")
        record = {
            "challenge_id": challenge_id,
            "case_id": case_id,
            "challenger": self._sender(),
            "target_type": final_target_type,
            "target_id": target_id,
            "challenge_reason": final_reason,
            "explanation": self._limit(explanation, 1400),
            "evidence_uri": self._limit(evidence_uri, 500),
            "evidence_hash": self._limit(evidence_hash, 130),
            "created_at": created_at,
        }
        self.challenges[challenge_id] = self._json(record)
        self.case_challenge_index[case_id] = self._append(
            self.case_challenge_index.get(case_id, ""),
            challenge_id,
        )

        case["status"] = "challenged"
        self.cases[case_id] = self._json(case)

        self._record_audit(
            case_id,
            "CHALLENGE_FILED",
            self._sender(),
            "Challenge filed against " + final_target_type + " (" + final_reason + ")",
            evidence_hash,
            created_at,
        )
        return challenge_id

    @gl.public.write
    def close_case(self, case_id: str, closed_at: str) -> None:
        self._require_not_paused()
        case = self._require_case_exists(case_id)
        if self._sender() != case.get("creator", ""):
            raise gl.vm.UserError("Only the case creator can close this case")
        # Closing does not remove records; the case remains readable.
        case["status"] = "closed"
        self.cases[case_id] = self._json(case)
        self._record_audit(
            case_id,
            "CASE_CLOSED",
            self._sender(),
            "Case closed to new submissions; records remain readable",
            "",
            closed_at,
        )

    # ------------------------------------------------------------------
    # Non-deterministic archival mapping
    # ------------------------------------------------------------------

    @gl.public.write
    def request_archival_mapping(self, case_id: str, requested_at: str) -> str:
        self._require_not_paused()
        case = self._require_case_exists(case_id)
        if case.get("status", "") == "closed":
            raise gl.vm.UserError("Case is closed")
        version_ids = self._split_ids(self.case_version_index.get(case_id, ""))
        if len(version_ids) < 2:
            raise gl.vm.UserError("At least two versions are required before mapping")

        case["status"] = "mapping_requested"
        self.cases[case_id] = self._json(case)
        self._record_audit(
            case_id,
            "MAPPING_REQUESTED",
            self._sender(),
            "Archival mapping requested from GenLayer validators",
            "",
            requested_at,
        )
        return self._run_mapping(case_id, requested_at)

    @gl.public.write
    def request_remapping(self, case_id: str, requested_at: str) -> str:
        self._require_not_paused()
        case = self._require_case_exists(case_id)
        if case.get("status", "") == "closed":
            raise gl.vm.UserError("Case is closed")
        if self.case_map_index.get(case_id, "") == "":
            raise gl.vm.UserError("No prior map exists; call request_archival_mapping first")

        has_new_versions = False
        for version_id in self._split_ids(self.case_version_index.get(case_id, "")):
            version = self._load(self.versions.get(version_id, ""))
            if version.get("status", "") == "submitted":
                has_new_versions = True
        if case.get("status", "") != "challenged" and not has_new_versions:
            raise gl.vm.UserError("Remapping requires a challenge or new versions since last map")

        case["status"] = "remapping_requested"
        self.cases[case_id] = self._json(case)
        self._record_audit(
            case_id,
            "REMAPPING_REQUESTED",
            self._sender(),
            "Remapping requested; previous maps remain visible for continuity",
            "",
            requested_at,
        )
        # Prior maps stay in case_map_index: interpretive history is never deleted.
        return self._run_mapping(case_id, requested_at)

    def _run_mapping(self, case_id: str, generated_at: str) -> str:
        case = self._require_case_exists(case_id)

        version_ids = self._split_ids(self.case_version_index.get(case_id, ""))
        versions_payload: typing.List[typing.Any] = []
        for version_id in version_ids:
            version = self._load(self.versions.get(version_id, ""))
            versions_payload.append(
                {
                    "version_id": version.get("version_id", ""),
                    "title": version.get("title", ""),
                    "version_label": version.get("version_label", ""),
                    "content_uri": version.get("content_uri", ""),
                    "content_hash": version.get("content_hash", ""),
                    "source_uri": version.get("source_uri", ""),
                    "source_type": version.get("source_type", ""),
                    "claimed_author": version.get("claimed_author", ""),
                    "claimed_date": version.get("claimed_date", ""),
                    "language": version.get("language", ""),
                    "status": version.get("status", ""),
                }
            )

        challenges_payload: typing.List[typing.Any] = []
        for challenge_id in self._split_ids(self.case_challenge_index.get(case_id, "")):
            challenge = self._load(self.challenges.get(challenge_id, ""))
            challenges_payload.append(
                {
                    "target_type": challenge.get("target_type", ""),
                    "target_id": challenge.get("target_id", ""),
                    "challenge_reason": challenge.get("challenge_reason", ""),
                    "explanation": challenge.get("explanation", ""),
                    "evidence_uri": challenge.get("evidence_uri", ""),
                    "evidence_hash": challenge.get("evidence_hash", ""),
                }
            )

        case_json = self._json(
            {
                "case_id": case_id,
                "title": case.get("title", ""),
                "description": case.get("description", ""),
                "archive_type": case.get("archive_type", ""),
                "case_context_uri": case.get("case_context_uri", ""),
            }
        )

        def build_evidence_context() -> str:
            verified_versions: typing.List[typing.Any] = []
            verified_version_count = 0
            for item in versions_payload:
                snapshot = self._fetch_integrity_snapshot(
                    str(item.get("content_uri", "")),
                    str(item.get("content_hash", "")),
                    "version:" + str(item.get("version_id", "")),
                )
                if snapshot.get("retrieval_status", "") == "verified":
                    verified_version_count = verified_version_count + 1
                item["validator_retrieval"] = snapshot
                verified_versions.append(item)

            verified_challenges: typing.List[typing.Any] = []
            failed_challenge_evidence = 0
            for item in challenges_payload:
                evidence_uri = str(item.get("evidence_uri", ""))
                evidence_hash = str(item.get("evidence_hash", ""))
                if evidence_uri.strip() == "" or evidence_hash.strip() == "":
                    item["validator_retrieval"] = {
                        "label": "challenge:" + str(item.get("target_id", "")),
                        "uri": self._limit(evidence_uri, 500),
                        "retrieval_status": "missing_evidence",
                        "http_status": 0,
                        "claimed_sha256": self._normalise_hash(evidence_hash),
                        "computed_sha256": "",
                        "hash_match": False,
                        "byte_length": 0,
                        "content_excerpt": "",
                        "provenance_notes": "Challenge lacks both retrievable evidence_uri and evidence_hash.",
                    }
                    failed_challenge_evidence = failed_challenge_evidence + 1
                else:
                    snapshot = self._fetch_integrity_snapshot(
                        evidence_uri,
                        evidence_hash,
                        "challenge:" + str(item.get("target_id", "")),
                    )
                    if snapshot.get("retrieval_status", "") != "verified":
                        failed_challenge_evidence = failed_challenge_evidence + 1
                    item["validator_retrieval"] = snapshot
                verified_challenges.append(item)

            sufficient_evidence = verified_version_count >= 2 and failed_challenge_evidence == 0
            evidence_gate = {
                "verified_version_count": verified_version_count,
                "total_version_count": len(versions_payload),
                "failed_challenge_evidence_count": failed_challenge_evidence,
                "sufficient_evidence": sufficient_evidence,
                "required_outcome_if_false": "insufficient_evidence",
                "rule": (
                    "At least two submitted records must be retrievable by validators and match "
                    "their claimed sha256 hashes. Every open challenge with evidence must also "
                    "be retrievable and hash-verified. If this is false, the archival conclusion "
                    "must explicitly be insufficient_evidence."
                ),
            }

            return (
                f"ARCHIVE CASE: {case_json}\n"
                f"VALIDATOR EVIDENCE GATE: {self._json(evidence_gate)}\n"
                f"VALIDATOR-FETCHED SUBMITTED VERSIONS: {self._json(verified_versions)}\n"
                f"VALIDATOR-FETCHED OPEN CHALLENGES: {self._json(verified_challenges)}"
            )

        # non_comparative: every validator fetches and hash-checks the disputed
        # records before judging the leader's archival map.
        consensus_json = gl.eq_principle.prompt_non_comparative(
            build_evidence_context,
            task=(
                "You are an archival reasoning agent for Fractured Archive Resolver. "
                "Your task is not to choose one version and erase the rest. "
                "Use validator-fetched content excerpts and validator-computed sha256 hashes, "
                "not submitter-authored metadata alone. Compare the submitted versions of this archive case. Identify agreement zones, "
                "divergence points, likely timeline, source reliability, possible transformations, "
                "missing context, and uncertainty. Preserve contradictions where they remain "
                "meaningful or unresolved. Do not invent evidence. Do not make private assumptions. "
                "If the VALIDATOR EVIDENCE GATE has sufficient_evidence=false, return map_status "
                "insufficient_evidence, uncertainty_level high or irreducible, recommended_archive_treatment "
                "requires_more_evidence, and confidence no higher than 35. "
                "Return ONLY valid JSON — no markdown, no emojis, no explanation outside the JSON.\n\n"
                "Return exactly this structure:\n"
                '{"map_status":"partial_map","relationship_summary":"...",'
                '"likely_evolution":[{"step":1,"version_ids":["ver-1"],"likely_period":"...",'
                '"placement_label":"likely_first","interpretation":"...","confidence":70,'
                '"supporting_notes":"..."}],'
                '"agreement_zones":[{"summary":"...","version_ids":["ver-1","ver-2"],"confidence":80}],'
                '"divergence_points":[{"divergence_type":"changed_obligation","summary":"...",'
                '"affected_versions":["ver-1","ver-2"],"severity":"major","confidence":75,'
                '"evidence_notes":"..."}],'
                '"version_reliability":[{"version_id":"ver-1","reliability_level":"medium","reason":"..."}],'
                '"evidence_verification":{"verified_version_count":2,"total_version_count":2,'
                '"failed_challenge_evidence_count":0,"sufficient_evidence":true,"notes":"..."},'
                '"uncertainty_level":"medium","recommended_archive_treatment":"preserve_as_parallel",'
                '"human_notes":"...","confidence":70}\n\n'
                "map_status options: resolved_map, partial_map, insufficient_evidence, contested_map, requires_more_versions\n"
                "divergence_type options: added_claim, removed_claim, changed_wording, changed_date, "
                "changed_actor, changed_causality, changed_obligation, changed_tone, translation_shift, "
                "omission, contradictory_memory, metadata_conflict, authorship_conflict, source_chain_gap, "
                "possible_tampering, unclear_difference\n"
                "severity options: minor, moderate, major, critical, unknown\n"
                "placement_label options: likely_first, possible_revision, later_summary, disputed_branch, "
                "uncertain_placement, parallel_memory\n"
                "reliability_level options: high, medium, low, unknown\n"
                "uncertainty_level options: low, medium, high, irreducible\n"
                "recommended_archive_treatment options: preserve_as_primary, preserve_as_parallel, "
                "preserve_as_later_revision, preserve_as_translation_variant, preserve_as_disputed_memory, "
                "preserve_as_low_confidence, preserve_as_possible_tampering, exclude_from_current_map, "
                "requires_more_evidence\n"
                "All confidence values are integers 0-100. version_ids must match the submitted version IDs exactly."
            ),
            criteria=(
                "The response must be valid JSON matching the requested structure.\n"
                "The map must be based on validator-fetched excerpts and validator-computed hashes, "
                "not only submitter-authored titles, dates, source labels, or metadata.\n"
                "If fewer than two submitted records are retrievable and sha256-verified by validators, "
                "map_status must be insufficient_evidence.\n"
                "If any challenge evidence is missing, unretrievable, or hash-mismatched, map_status must be "
                "insufficient_evidence unless the challenge is explicitly irrelevant to the current map.\n"
                "map_status must be exactly one of: resolved_map, partial_map, insufficient_evidence, "
                "contested_map, requires_more_versions.\n"
                "uncertainty_level must be exactly one of: low, medium, high, irreducible.\n"
                "Every version_id referenced must be one of the submitted version IDs.\n"
                "The map must not erase or dismiss any submitted version without stated evidence.\n"
                "possible_tampering may only be asserted with severity unknown unless evidence supports it.\n"
                "The interpretation must be a reasonable reading of the submitted versions and challenges; "
                "contradictions that cannot be resolved from the evidence must be preserved, not resolved away."
            ),
        )

        normalized = self._normalise_archival_map(consensus_json, case_id, version_ids)
        normalized = self._apply_evidence_gate(normalized)

        map_id = self._next_id("map", "map")
        map_record = {
            "map_id": map_id,
            "case_id": case_id,
            "canonical_json": self._json(normalized),
            "generated_at": generated_at,
            "map_status": normalized["map_status"],
            "confidence": normalized["confidence"],
            "uncertainty_level": normalized["uncertainty_level"],
            "generated_by": "GENLAYER_CONSENSUS",
        }
        self.maps[map_id] = self._json(map_record)
        self.case_map_index[case_id] = self._append(
            self.case_map_index.get(case_id, ""),
            map_id,
        )

        flagged_ids = ""
        for challenge_id in self._split_ids(self.case_challenge_index.get(case_id, "")):
            challenge = self._load(self.challenges.get(challenge_id, ""))
            if challenge.get("target_type", "") == "version":
                flagged_ids = self._append(flagged_ids, challenge.get("target_id", ""))

        for version_id in version_ids:
            version = self._load(self.versions.get(version_id, ""))
            if version_id in self._split_ids(flagged_ids):
                version["status"] = "flagged"
            else:
                version["status"] = "included_in_map"
            self.versions[version_id] = self._json(version)

        case = self._require_case_exists(case_id)
        case["status"] = "mapped"
        case["latest_map_id"] = map_id
        self.cases[case_id] = self._json(case)

        self._record_audit(
            case_id,
            "GENLAYER_MAP_GENERATED",
            "GENLAYER_CONSENSUS",
            "Consensus archival map generated: "
            + normalized["map_status"]
            + " (uncertainty "
            + normalized["uncertainty_level"]
            + ")",
            map_id,
            generated_at,
        )
        return map_id

    def _pick_enum(self, value: typing.Any, allowed: str, fallback: str) -> str:
        cleaned = str(value).strip()
        for item in allowed.split("|"):
            if cleaned == item:
                return cleaned
        return fallback

    def _clean_version_ids(self, value: typing.Any, valid_ids: typing.List[str]) -> typing.List[str]:
        result: typing.List[str] = []
        if isinstance(value, list):
            for item in value:
                text = str(item)
                if text in valid_ids and text not in result:
                    result.append(text)
        return result

    def _normalise_archival_map(
        self,
        raw: typing.Any,
        case_id: str,
        valid_ids: typing.List[str],
    ) -> typing.Any:
        if isinstance(raw, str):
            text = raw.strip()
            if text.startswith("```"):
                text = text.strip("`")
                if text.startswith("json"):
                    text = text[4:]
            start = text.find("{")
            end = text.rfind("}")
            if start == -1 or end == -1:
                raise gl.vm.UserError("Consensus output is not JSON")
            parsed = json.loads(text[start : end + 1])
        else:
            parsed = raw

        likely_evolution: typing.List[typing.Any] = []
        raw_evolution = parsed.get("likely_evolution", [])
        if isinstance(raw_evolution, list):
            step_number = 0
            for step in raw_evolution:
                if len(likely_evolution) >= 12:
                    break
                step_number = step_number + 1
                likely_evolution.append(
                    {
                        "step": self._to_int(step.get("step", step_number), step_number),
                        "version_ids": self._clean_version_ids(step.get("version_ids", []), valid_ids),
                        "likely_period": self._limit(step.get("likely_period", ""), 120),
                        "placement_label": self._pick_enum(
                            step.get("placement_label", ""),
                            "likely_first|possible_revision|later_summary|disputed_branch|uncertain_placement|parallel_memory",
                            "uncertain_placement",
                        ),
                        "interpretation": self._limit(step.get("interpretation", ""), 400),
                        "confidence": self._bounded_score(step.get("confidence", 0), 0),
                        "supporting_notes": self._limit(step.get("supporting_notes", ""), 300),
                    }
                )

        agreement_zones: typing.List[typing.Any] = []
        raw_zones = parsed.get("agreement_zones", [])
        if isinstance(raw_zones, list):
            for zone in raw_zones:
                if len(agreement_zones) >= 12:
                    break
                agreement_zones.append(
                    {
                        "summary": self._limit(zone.get("summary", ""), 400),
                        "version_ids": self._clean_version_ids(zone.get("version_ids", []), valid_ids),
                        "confidence": self._bounded_score(zone.get("confidence", 0), 0),
                    }
                )

        divergence_points: typing.List[typing.Any] = []
        raw_points = parsed.get("divergence_points", [])
        if isinstance(raw_points, list):
            point_number = 0
            for point in raw_points:
                if len(divergence_points) >= 20:
                    break
                point_number = point_number + 1
                divergence_points.append(
                    {
                        "point_id": "dp-" + str(point_number),
                        "case_id": case_id,
                        "divergence_type": self._pick_enum(
                            point.get("divergence_type", ""),
                            self.DIVERGENCE_TYPES,
                            "unclear_difference",
                        ),
                        "summary": self._limit(point.get("summary", ""), 400),
                        "affected_versions": self._clean_version_ids(point.get("affected_versions", []), valid_ids),
                        "severity": self._pick_enum(point.get("severity", ""), self.SEVERITIES, "unknown"),
                        "confidence": self._bounded_score(point.get("confidence", 0), 0),
                        "evidence_notes": self._limit(point.get("evidence_notes", ""), 400),
                    }
                )

        version_reliability: typing.List[typing.Any] = []
        raw_reliability = parsed.get("version_reliability", [])
        if isinstance(raw_reliability, list):
            for entry in raw_reliability:
                version_id = str(entry.get("version_id", ""))
                if version_id not in valid_ids:
                    continue
                version_reliability.append(
                    {
                        "version_id": version_id,
                        "reliability_level": self._pick_enum(
                            entry.get("reliability_level", ""),
                            self.RELIABILITY_LEVELS,
                            "unknown",
                        ),
                        "reason": self._limit(entry.get("reason", ""), 300),
                    }
                )

        raw_evidence = parsed.get("evidence_verification", {})
        if not isinstance(raw_evidence, dict):
            raw_evidence = {}
        evidence_verification = {
            "verified_version_count": self._to_int(raw_evidence.get("verified_version_count", 0), 0),
            "total_version_count": self._to_int(raw_evidence.get("total_version_count", len(valid_ids)), len(valid_ids)),
            "failed_challenge_evidence_count": self._to_int(
                raw_evidence.get("failed_challenge_evidence_count", 0),
                0,
            ),
            "sufficient_evidence": self._to_bool(raw_evidence.get("sufficient_evidence", False)),
            "notes": self._limit(raw_evidence.get("notes", ""), 500),
        }

        return {
            "case_id": case_id,
            "map_status": self._pick_enum(parsed.get("map_status", ""), self.MAP_STATUSES, "partial_map"),
            "relationship_summary": self._limit(parsed.get("relationship_summary", ""), 800),
            "likely_evolution": likely_evolution,
            "agreement_zones": agreement_zones,
            "divergence_points": divergence_points,
            "version_reliability": version_reliability,
            "evidence_verification": evidence_verification,
            "uncertainty_level": self._pick_enum(
                parsed.get("uncertainty_level", ""), self.UNCERTAINTY_LEVELS, "high"
            ),
            "recommended_archive_treatment": self._pick_enum(
                parsed.get("recommended_archive_treatment", ""),
                self.ARCHIVE_TREATMENTS,
                "requires_more_evidence",
            ),
            "human_notes": self._limit(parsed.get("human_notes", ""), 500),
            "confidence": self._bounded_score(parsed.get("confidence", 50), 50),
        }

    def _apply_evidence_gate(self, normalized: typing.Any) -> typing.Any:
        evidence = normalized.get("evidence_verification", {})
        verified_versions = self._to_int(evidence.get("verified_version_count", 0), 0)
        failed_challenges = self._to_int(evidence.get("failed_challenge_evidence_count", 0), 0)
        sufficient = self._to_bool(evidence.get("sufficient_evidence", False))
        if not sufficient or verified_versions < 2 or failed_challenges > 0:
            normalized["map_status"] = "insufficient_evidence"
            normalized["uncertainty_level"] = "high"
            normalized["recommended_archive_treatment"] = "requires_more_evidence"
            if self._to_int(normalized.get("confidence", 0), 0) > 35:
                normalized["confidence"] = 35
            notes = str(normalized.get("human_notes", ""))
            gate_note = (
                "Validator evidence gate failed: at least two records and all challenge evidence "
                "must be retrieved and sha256-verified before an archival conclusion can be trusted."
            )
            if gate_note not in notes:
                normalized["human_notes"] = self._limit((notes + " " + gate_note).strip(), 500)
        return normalized

    # ------------------------------------------------------------------
    # Read methods
    # ------------------------------------------------------------------

    @gl.public.view
    def get_case(self, case_id: str) -> str:
        return self._json(self._require_case_exists(case_id))

    @gl.public.view
    def get_all_cases(self) -> str:
        result: typing.List[typing.Any] = []
        for case_id in self._split_ids(self.case_index.get("all", "")):
            result.append(self._load(self.cases.get(case_id, "")))
        return self._json(result)

    @gl.public.view
    def get_versions(self, case_id: str) -> str:
        self._require_case_exists(case_id)
        result: typing.List[typing.Any] = []
        for version_id in self._split_ids(self.case_version_index.get(case_id, "")):
            result.append(self._load(self.versions.get(version_id, "")))
        return self._json(result)

    @gl.public.view
    def get_current_map(self, case_id: str) -> str:
        case = self._require_case_exists(case_id)
        latest_map_id = case.get("latest_map_id", "")
        if latest_map_id == "":
            return self._json({})
        return self.maps.get(latest_map_id, "")

    @gl.public.view
    def get_map_history(self, case_id: str) -> str:
        self._require_case_exists(case_id)
        result: typing.List[typing.Any] = []
        for map_id in self._split_ids(self.case_map_index.get(case_id, "")):
            result.append(self._load(self.maps.get(map_id, "")))
        return self._json(result)

    @gl.public.view
    def get_challenges(self, case_id: str) -> str:
        self._require_case_exists(case_id)
        result: typing.List[typing.Any] = []
        for challenge_id in self._split_ids(self.case_challenge_index.get(case_id, "")):
            result.append(self._load(self.challenges.get(challenge_id, "")))
        return self._json(result)

    @gl.public.view
    def get_divergence_points(self, case_id: str) -> str:
        case = self._require_case_exists(case_id)
        latest_map_id = case.get("latest_map_id", "")
        if latest_map_id == "":
            return self._json([])
        map_record = self._load(self.maps.get(latest_map_id, ""))
        canonical = self._load(map_record.get("canonical_json", ""))
        return self._json(canonical.get("divergence_points", []))

    @gl.public.view
    def get_audit_trail(self, case_id: str) -> str:
        self._require_case_exists(case_id)
        result: typing.List[typing.Any] = []
        for audit_id in self._split_ids(self.case_audit_index.get(case_id, "")):
            result.append(self._load(self.audit_logs.get(audit_id, "")))
        return self._json(result)
