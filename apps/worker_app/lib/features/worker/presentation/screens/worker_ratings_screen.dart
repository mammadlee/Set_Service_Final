import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/content_report_dialog.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../data/models/worker_rating.dart';
import '../../data/worker_repository.dart';

class WorkerRatingsScreen extends StatefulWidget {
  const WorkerRatingsScreen({super.key});

  @override
  State<WorkerRatingsScreen> createState() => _WorkerRatingsScreenState();
}

class _WorkerRatingsScreenState extends State<WorkerRatingsScreen> {
  late Future<WorkerRatingSummary> _future;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<WorkerRatingSummary> _load() =>
      context.read<WorkerRepository>().getMyRatings();

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  Future<void> _report(WorkerRating rating) async {
    final input = await showContentReportDialog(context, subjectLabel: 'Rəyi');
    if (input == null || !mounted) return;
    try {
      await context.read<WorkerRepository>().reportRating(
        ratingId: rating.id,
        reason: input.reason,
        details: input.details,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Şikayət admin yoxlamasına göndərildi.')),
      );
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Şikayəti göndərmək mümkün olmadı.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reytinqlər və rəylər')),
      body: ConstrainedPage(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: FutureBuilder<WorkerRatingSummary>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return ListView(
                children: [
                  InlineMessage(
                    message: snapshot.error is ApiException
                        ? (snapshot.error! as ApiException).message
                        : 'Reytinqlər yüklənmədi.',
                    kind: InlineMessageKind.error,
                  ),
                  OutlinedButton(
                    onPressed: _refresh,
                    child: const Text('Yenidən cəhd et'),
                  ),
                ],
              );
            }
            final summary = snapshot.data!;
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                children: [
                  PremiumCard(
                    child: Text(
                      'Orta reytinq: ${summary.average.toStringAsFixed(1)}  ·  ${summary.total} qiymətləndirmə',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    InlineMessage(
                      message: _error!,
                      kind: InlineMessageKind.error,
                    ),
                  ],
                  if (summary.ratings.isEmpty) ...[
                    const SizedBox(height: 12),
                    const InlineMessage(message: 'Hələ reytinq və rəy yoxdur.'),
                  ],
                  ...summary.ratings.map(
                    (rating) => Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: PremiumCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              rating.orderTitle.isEmpty
                                  ? 'Sifariş'
                                  : rating.orderTitle,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 6),
                            Text('${rating.score} / 5 ulduz'),
                            if (rating.createdAt != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                DateFormat(
                                  'dd.MM.yyyy',
                                ).format(rating.createdAt!.toLocal()),
                              ),
                            ],
                            if (rating.feedback?.trim().isNotEmpty == true) ...[
                              const SizedBox(height: 10),
                              Text(rating.feedback!),
                            ],
                            const SizedBox(height: 8),
                            TextButton.icon(
                              onPressed: () => _report(rating),
                              icon: const Icon(Icons.flag_outlined),
                              label: const Text('Rəyi şikayət et'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
