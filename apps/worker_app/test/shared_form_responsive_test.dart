import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/shared/app_strings.dart';
import 'package:worker_app/shared/widgets/checkout_confirmation_dialog.dart';
import 'package:worker_app/shared/widgets/content_report_dialog.dart';
import 'package:worker_app/shared/widgets/premium_components.dart';
import 'package:worker_app/shared/widgets/scrollable_centered_content.dart';

void main() {
  testWidgets(
    'report reason dropdown remains single-layered on a narrow scaled UI',
    (tester) async {
      _setNarrowViewport(tester);

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.3)),
            child: child!,
          ),
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => showContentReportDialog(
                  context,
                  subjectLabel: 'Çox uzun Azərbaycan dilində rəy',
                ),
                child: const Text('Şikayət dialogunu aç'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Şikayət dialogunu aç'));
      await tester.pumpAndSettle();

      final dropdown = tester.widget<DropdownButton<String>>(
        find.byWidgetPredicate((widget) => widget is DropdownButton<String>),
      );
      expect(dropdown.isExpanded, isTrue);
      expect(dropdown.itemHeight, isNull);
      expect(find.text('Uyğunsuz məzmun'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Yanlış və ya saxta məlumat').last);
      await tester.pumpAndSettle();

      expect(find.text('Yanlış və ya saxta məlumat'), findsOneWidget);
      expect(find.text('Uyğunsuz məzmun'), findsNothing);
      expect(tester.takeException(), isNull);

      tester.view.viewInsets = const FakeViewPadding(bottom: 220);
      await tester.showKeyboard(find.byType(TextField));
      await tester.pumpAndSettle();
      expect(find.text('Şikayət et'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('long shared validation errors wrap without clipping', (
    tester,
  ) async {
    _setNarrowViewport(tester);
    final formKey = GlobalKey<FormState>();

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: Scaffold(
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: formKey,
                child: Column(
                  children: [
                    TextFormField(
                      decoration: const InputDecoration(
                        labelText: AppStrings.password,
                      ),
                      validator: (_) => AppStrings.passwordValidation,
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: () => formKey.currentState!.validate(),
                      child: const Text('Yoxla'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Yoxla'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text(AppStrings.passwordValidation), findsOneWidget);
    final decoration = Theme.of(
      tester.element(find.byType(TextFormField)),
    ).inputDecorationTheme;
    expect(decoration.errorMaxLines, 3);
    expect(decoration.helperMaxLines, 3);
    expect(tester.takeException(), isNull);
  });

  testWidgets('checkout confirmation scrolls on short landscape with 2x text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(844, 390);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    bool? result;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                result = await showCheckoutConfirmationDialog(context);
              },
              child: const Text('Checkout dialogunu aç'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Checkout dialogunu aç'));
    await tester.pumpAndSettle();
    expect(find.byType(SingleChildScrollView), findsOneWidget);
    expect(tester.takeException(), isNull);

    final confirm = find.text(AppStrings.checkoutConfirmAction);
    await tester.scrollUntilVisible(
      confirm,
      180,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    await tester.tap(confirm);
    await tester.pumpAndSettle();
    expect(result, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('premium hero can preserve long user-controlled names', (
    tester,
  ) async {
    _setNarrowViewport(tester);
    const title =
        'Çox uzun beynəlxalq qonaqpərvərlik və tədbir xidmətləri müəssisəsi';
    const subtitle =
        'Beynəlxalq tədbirlər üzrə baş qonaq münasibətləri koordinatoru';

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: const Scaffold(
          body: SingleChildScrollView(
            child: PremiumHeroPanel(
              title: title,
              subtitle: subtitle,
              wrapFullText: true,
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    final titleWidget = tester.widget<Text>(find.text(title));
    final subtitleWidget = tester.widget<Text>(find.text(subtitle));
    expect(titleWidget.maxLines, isNull);
    expect(titleWidget.overflow, isNull);
    expect(subtitleWidget.maxLines, isNull);
    expect(subtitleWidget.overflow, isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('centered empty and error content scrolls on short large text UI', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(844, 390);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: Scaffold(
          body: ScrollableCenteredContent(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const PremiumEmptyState(
                  title: 'Məlumat tapılmadı',
                  message:
                      'Uzun Azərbaycan dilində server xətası və istifadəçi üçün izahlı məlumat tam görünməlidir.',
                  icon: Icons.inbox_outlined,
                ),
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () {},
                  child: const Text(AppStrings.tryAgain),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(SingleChildScrollView), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text(AppStrings.tryAgain),
      160,
      scrollable: find.byType(Scrollable),
    );
    await tester.pumpAndSettle();
    expect(find.text(AppStrings.tryAgain), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

void _setNarrowViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(320, 568);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetViewInsets);
}
