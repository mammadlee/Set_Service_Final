part of 'company_home_shell.dart';

/// Uses the same venue kiosk capabilities as the admin panel. The backend's
/// eligible-orders response is the only source of the QR creation decision.
class CompanyOrderQrCard extends StatefulWidget {
  const CompanyOrderQrCard({required this.order, super.key});
  final MobileOrder order;

  @override
  State<CompanyOrderQrCard> createState() => _CompanyOrderQrCardState();
}

class _CompanyOrderQrCardState extends State<CompanyOrderQrCard> {
  CompanyOrderQrState? _state;
  bool _loading = true;
  bool _acting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(CompanyOrderQrCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.order != widget.order) _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final state = await context.read<CompanyRepository>().getOrderQrState(
        widget.order.id,
      );
      if (mounted) setState(() => _state = state);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = CompanyStrings.qrLoadFailed);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    if (_acting || _state?.eligible != true) return;
    setState(() {
      _acting = true;
      _error = null;
    });
    try {
      final kiosk = await context.read<CompanyRepository>().createOrderQr(
        widget.order,
      );
      if (!mounted) return;
      setState(
        () => _state = CompanyOrderQrState(eligible: true, kiosks: [kiosk]),
      );
      await _showKiosk(kiosk);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = AppStrings.actionFailed);
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  Future<void> _showKiosk(CompanyVenueKiosk kiosk) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => _CompanyQrScreen(kiosk: kiosk)),
    );
    if (changed == true && mounted) await _load();
  }

  @override
  Widget build(BuildContext context) => PremiumCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader(title: CompanyStrings.qrTitle),
        if (_loading)
          const LinearProgressIndicator()
        else ...[
          if (_error != null) ...[
            InlineMessage(message: _error!, kind: InlineMessageKind.error),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: _acting ? null : _load,
              icon: const Icon(Icons.refresh),
              label: const Text(AppStrings.tryAgain),
            ),
          ],
          if (_state != null) ...[
            Text(
              _state!.kiosks.isNotEmpty
                  ? CompanyStrings.qrReady
                  : _state!.eligible
                  ? CompanyStrings.qrNotCreated
                  : CompanyStrings.qrUnavailable,
            ),
            const SizedBox(height: 10),
            const Text(CompanyStrings.qrHelp),
            if (_state!.kiosks.isNotEmpty) ...[
              const SizedBox(height: 16),
              for (final kiosk in _state!.kiosks)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: FilledButton.icon(
                    onPressed: _acting ? null : () => _showKiosk(kiosk),
                    icon: const Icon(Icons.qr_code_2),
                    label: Text(
                      _state!.kiosks.length == 1
                          ? CompanyStrings.viewQr
                          : '${CompanyStrings.viewQr}: ${kiosk.name}',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
            ] else if (_state!.eligible) ...[
              const SizedBox(height: 16),
              LoadingButton(
                label: CompanyStrings.createQr,
                icon: Icons.qr_code_2,
                loading: _acting,
                onPressed: _create,
              ),
            ],
          ],
        ],
      ],
    ),
  );
}

class _CompanyQrScreen extends StatefulWidget {
  const _CompanyQrScreen({required this.kiosk});
  final CompanyVenueKiosk kiosk;

  @override
  State<_CompanyQrScreen> createState() => _CompanyQrScreenState();
}

class _CompanyQrScreenState extends State<_CompanyQrScreen> {
  bool _acting = false;
  String? _error;

  Future<void> _open() async {
    final url = widget.kiosk.kioskUrl;
    if (url == null || !KioskUrlPolicy.isAllowed(url)) {
      setState(() => _error = AppStrings.kioskUrlBlocked);
      return;
    }
    try {
      final opened = await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      );
      if (!opened && mounted) {
        setState(() => _error = 'QR ekranını açmaq mümkün olmadı.');
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'QR ekranını açmaq mümkün olmadı.');
    }
  }

  Future<void> _deactivate() async {
    if (_acting ||
        !await _confirmAction(context, CompanyStrings.qrDeactivateConfirm) ||
        !mounted) {
      return;
    }
    setState(() {
      _acting = true;
      _error = null;
    });
    try {
      await context.read<CompanyRepository>().deactivateOrderQr(
        widget.kiosk.id,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = AppStrings.actionFailed);
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final url = widget.kiosk.kioskUrl;
    final allowed = url != null && KioskUrlPolicy.isAllowed(url);
    return Scaffold(
      appBar: AppBar(title: const Text(CompanyStrings.qrTitle)),
      body: ConstrainedPage(
        child: ListView(
          children: [
            const Icon(
              Icons.qr_code_2,
              size: 88,
              color: BrandColors.primaryBurgundy,
            ),
            const SizedBox(height: 20),
            Text(
              widget.kiosk.name,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            const StatusPill(status: 'active'),
            const SizedBox(height: 20),
            const Text(CompanyStrings.qrHelp),
            const SizedBox(height: 12),
            const InlineMessage(message: CompanyStrings.qrLinkHelp),
            const SizedBox(height: 20),
            if (_error != null) ...[
              InlineMessage(message: _error!, kind: InlineMessageKind.error),
              const SizedBox(height: 12),
            ],
            if (!allowed)
              const InlineMessage(
                message: AppStrings.kioskUrlBlocked,
                kind: InlineMessageKind.error,
              ),
            FilledButton.icon(
              onPressed: allowed && !_acting ? _open : null,
              icon: const Icon(Icons.open_in_new),
              label: const Text(CompanyStrings.qrOpen),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: allowed && !_acting
                  ? () async {
                      await Clipboard.setData(ClipboardData(text: url));
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(CompanyStrings.qrCopied),
                          ),
                        );
                      }
                    }
                  : null,
              icon: const Icon(Icons.copy),
              label: const Text(CompanyStrings.qrCopy),
            ),
            const SizedBox(height: 32),
            const Divider(),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _acting ? null : _deactivate,
              style: OutlinedButton.styleFrom(
                foregroundColor: BrandColors.error,
              ),
              icon: const Icon(Icons.block),
              label: Text(
                _acting ? AppStrings.working : CompanyStrings.qrDeactivate,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
