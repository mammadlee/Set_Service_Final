import 'dart:async';

/// Server error codes that conclusively mean the local session is no longer
/// usable. Transient transport failures and generic 5xx responses must never
/// clear credentials.
const terminalSessionErrorCodes = <String>{
  'INVALID_REFRESH_TOKEN',
  'REFRESH_TOKEN_REUSE',
  'TOKEN_REVOKED',
  'ACCOUNT_DISABLED',
  'ACCOUNT_INACTIVE',
  'ADMIN_ACCOUNT_INACTIVE',
  'ADMIN_SESSION_INVALID',
  'ACCOUNT_DELETED',
  'USER_DELETED',
  'ACCOUNT_REJECTED',
  'ACCOUNT_SUSPENDED',
};

bool isTerminalSessionErrorCode(String? code) {
  return code != null && terminalSessionErrorCodes.contains(code);
}

const blockedSessionErrorCodes = <String>{
  'ACCOUNT_DISABLED',
  'ACCOUNT_INACTIVE',
  'ADMIN_ACCOUNT_INACTIVE',
  'ACCOUNT_DELETED',
  'USER_DELETED',
  'ACCOUNT_REJECTED',
  'ACCOUNT_SUSPENDED',
};

enum SessionState {
  authenticated,
  unauthenticated,
  refreshing,
  offlineAuthenticated,
  expired,
  blocked,
}

class SessionInvalidation {
  const SessionInvalidation({required this.sessionKey, required this.code});

  final String sessionKey;
  final String code;
}

class SessionStateChange {
  const SessionStateChange({
    required this.sessionKey,
    required this.state,
    this.code,
  });

  final String sessionKey;
  final SessionState state;
  final String? code;
}

/// A single application-level channel that keeps API credential invalidation
/// and the corresponding role UI state in sync.
class SessionCoordinator {
  final StreamController<SessionInvalidation> _invalidations =
      StreamController<SessionInvalidation>.broadcast(sync: true);
  final StreamController<SessionStateChange> _stateChanges =
      StreamController<SessionStateChange>.broadcast(sync: true);
  final Map<String, SessionState> _states = <String, SessionState>{};

  Stream<SessionInvalidation> get invalidations => _invalidations.stream;
  Stream<SessionStateChange> get stateChanges => _stateChanges.stream;

  SessionState stateFor(String sessionKey) {
    return _states[sessionKey] ?? SessionState.unauthenticated;
  }

  void notifyState({
    required String sessionKey,
    required SessionState state,
    String? code,
  }) {
    if (_stateChanges.isClosed) return;
    if (_states[sessionKey] == state && code == null) return;
    _states[sessionKey] = state;
    _stateChanges.add(
      SessionStateChange(sessionKey: sessionKey, state: state, code: code),
    );
  }

  void notifyInvalidated({required String sessionKey, required String code}) {
    if (!isTerminalSessionErrorCode(code) || _invalidations.isClosed) return;
    notifyState(
      sessionKey: sessionKey,
      state: blockedSessionErrorCodes.contains(code)
          ? SessionState.blocked
          : SessionState.expired,
      code: code,
    );
    _invalidations.add(SessionInvalidation(sessionKey: sessionKey, code: code));
  }

  Future<void> dispose() async {
    await _invalidations.close();
    await _stateChanges.close();
  }
}
