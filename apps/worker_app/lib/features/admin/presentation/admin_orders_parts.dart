part of 'admin_home_shell.dart';

class _AdminOrdersTab extends StatefulWidget {
  const _AdminOrdersTab();

  @override
  State<_AdminOrdersTab> createState() => _AdminOrdersTabState();
}

class _AdminOrdersTabState extends State<_AdminOrdersTab> {
  late Future<MobileOrderPage> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().listOrders();
  }

  Future<void> _refresh() async {
    setState(() => _future = context.read<AdminRepository>().listOrders());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return _AsyncView<MobileOrderPage>(
      future: _future,
      onRetry: _refresh,
      builder: (page) {
        if (page.data.isEmpty) {
          return _EmptyState(message: AppStrings.noOrders, onAction: _refresh);
        }
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: page.data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) => _OrderCard(
              order: page.data[index],
              onTap: () => Navigator.of(context).push<void>(
                MaterialPageRoute(
                  builder: (_) =>
                      _AdminOrderDetailScreen(orderId: page.data[index].id),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _AdminOrderDetailScreen extends StatefulWidget {
  const _AdminOrderDetailScreen({required this.orderId});

  final String orderId;

  @override
  State<_AdminOrderDetailScreen> createState() =>
      _AdminOrderDetailScreenState();
}

class _AdminOrderDetailScreenState extends State<_AdminOrderDetailScreen> {
  late Future<MobileOrder> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().getOrder(widget.orderId);
  }

  Future<void> _refresh() async {
    setState(
      () => _future = context.read<AdminRepository>().getOrder(widget.orderId),
    );
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.details)),
      body: _AdminBackdrop(
        child: _AsyncView<MobileOrder>(
          future: _future,
          onRetry: _refresh,
          builder: (order) => RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _OrderCard(order: order),
                const SizedBox(height: 12),
                PremiumCard(
                  child: Column(
                    children: [
                      _DetailTile(AppStrings.company, order.companyName),
                      _DetailTile(
                        AppStrings.status,
                        AppStrings.statusLabel(order.status),
                      ),
                      _DetailTile(AppStrings.category, order.category),
                      _DetailTile(AppStrings.location, order.location),
                      _DetailTile(
                        AppStrings.requiredWorkers,
                        '${order.assignmentCount}/${order.requiredCount}',
                      ),
                      _DetailTile(
                        AppStrings.starts,
                        _dateText(order.startDatetime),
                      ),
                      _DetailTile(
                        AppStrings.ends,
                        _dateText(order.endDatetime),
                      ),
                      if (order.payRate != null)
                        _DetailTile(AppStrings.payRate, '${order.payRate}'),
                    ],
                  ),
                ),
                if (order.categoryItems.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  PremiumCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          AppStrings.categoryRequirements,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        ...order.categoryItems.map(
                          (item) => _DetailTile(
                            item.category,
                            '${item.assignedCount}/${item.requiredCount}',
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                PremiumCard(
                  dark: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        AppStrings.description,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              color: BrandColors.white,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        order.description.isEmpty
                            ? AppStrings.noData
                            : order.description,
                        style: const TextStyle(color: BrandColors.white),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AdminWorkerDetailScreen extends StatefulWidget {
  const _AdminWorkerDetailScreen({required this.workerId});

  final String workerId;

  @override
  State<_AdminWorkerDetailScreen> createState() =>
      _AdminWorkerDetailScreenState();
}

class _AdminWorkerDetailScreenState extends State<_AdminWorkerDetailScreen> {
  late Future<AdminWorkerProfile> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().getWorker(widget.workerId);
  }

  Future<void> _refresh() async {
    setState(
      () =>
          _future = context.read<AdminRepository>().getWorker(widget.workerId),
    );
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.workerName)),
      body: _AsyncView<AdminWorkerProfile>(
        future: _future,
        onRetry: _refresh,
        builder: (worker) => RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              PremiumHeroPanel(
                title: worker.name,
                subtitle: worker.position.isEmpty
                    ? AppStrings.worker
                    : worker.position,
                compact: true,
                trailing: StatusPill(status: worker.status),
                children: [
                  PremiumChip(
                    label: worker.workerClass ?? AppStrings.classNotSelected,
                    icon: Icons.workspace_premium_outlined,
                    dark: true,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              PremiumCard(
                child: Column(
                  children: [
                    _DetailTile(AppStrings.phoneNumber, worker.phone),
                    _DetailTile(
                      AppStrings.status,
                      AppStrings.statusLabel(worker.status),
                    ),
                    _DetailTile(
                      AppStrings.available,
                      worker.availability
                          ? AppStrings.available
                          : AppStrings.unavailable,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AdminCompanyDetailScreen extends StatefulWidget {
  const _AdminCompanyDetailScreen({required this.companyId});

  final String companyId;

  @override
  State<_AdminCompanyDetailScreen> createState() =>
      _AdminCompanyDetailScreenState();
}

class _AdminCompanyDetailScreenState extends State<_AdminCompanyDetailScreen> {
  late Future<AdminCompanyProfile> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<AdminRepository>().getCompany(widget.companyId);
  }

  Future<void> _refresh() async {
    setState(
      () => _future = context.read<AdminRepository>().getCompany(
        widget.companyId,
      ),
    );
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(AppStrings.company)),
      body: _AsyncView<AdminCompanyProfile>(
        future: _future,
        onRetry: _refresh,
        builder: (company) => RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              PremiumHeroPanel(
                title: company.name,
                subtitle: company.contactName.isEmpty
                    ? AppStrings.company
                    : company.contactName,
                compact: true,
                trailing: StatusPill(status: company.status),
              ),
              const SizedBox(height: 12),
              PremiumCard(
                child: Column(
                  children: [
                    _DetailTile(AppStrings.phoneNumber, company.phone),
                    _DetailTile(
                      AppStrings.status,
                      AppStrings.statusLabel(company.status),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, this.onTap});

  final MobileOrder order;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Premium3DCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  order.title,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.black,
                    fontWeight: FontWeight.w800,
                    height: 1.15,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              StatusPill(status: order.status),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            order.companyName,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: BrandColors.darkText,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            '${_orderCategorySummary(order)} • ${order.location}',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: BrandColors.darkText,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailTile extends StatelessWidget {
  const _DetailTile(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 14),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: BrandColors.accentGold, width: 0.7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 5),
          Text(
            value.isEmpty ? AppStrings.noData : value,
            style: Theme.of(
              context,
            ).textTheme.bodyLarge?.copyWith(color: BrandColors.darkText),
          ),
        ],
      ),
    );
  }
}
