import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/config/kiosk_url_policy.dart';

/// The data printed on a durable QR poster.
///
/// [stableUrl] is the venue-kiosk capability URL, not the short-lived
/// attendance token. The kiosk page mints a fresh signed attendance token for
/// every refresh and the API still checks assignment and worker ownership.
class QrPosterData {
  QrPosterData({
    required this.stableUrl,
    required this.orderId,
    required this.orderTitle,
    required this.companyName,
    required this.location,
    this.schedule,
  }) {
    if (!KioskUrlPolicy.isAllowed(stableUrl)) {
      throw ArgumentError.value(
        stableUrl,
        'stableUrl',
        'Only the configured HTTPS kiosk capability URL can be exported.',
      );
    }
  }

  final String stableUrl;
  final String orderId;
  final String orderTitle;
  final String companyName;
  final String location;
  final String? schedule;

  /// This is deliberately the stable kiosk page URL. It must never be a
  /// signed 30-second attendance token.
  String get qrPayload => stableUrl;

  String get fileStem {
    final normalized = orderId.replaceAll(RegExp(r'[^A-Za-z0-9_-]+'), '-');
    return 'set-service-qr-${normalized.isEmpty ? 'order' : normalized}';
  }

  String get printablePageUrl {
    final parsed = Uri.parse(stableUrl);
    return parsed
        .replace(fragment: '')
        .toString()
        .replaceFirst(RegExp(r'#$'), '');
  }
}

class QrPosterExporter {
  const QrPosterExporter._();

  static const _posterWidth = 1240.0;
  static const _posterHeight = 1754.0;
  static const _burgundy = Color(0xFF8A1818);
  static const _gold = Color(0xFFE3C189);
  static const _cream = Color(0xFFF7F1EA);
  static const _graphite = Color(0xFF585858);

  static Future<Uint8List> buildPng(QrPosterData data) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final fullRect = const Rect.fromLTWH(0, 0, _posterWidth, _posterHeight);

    canvas.drawRect(fullRect, Paint()..color = _cream);
    canvas.drawRect(
      const Rect.fromLTWH(0, 0, _posterWidth, 260),
      Paint()..color = _burgundy,
    );
    canvas.drawRect(
      const Rect.fromLTWH(0, 250, _posterWidth, 10),
      Paint()..color = _gold,
    );

    _paintText(
      canvas,
      'SET SERVICE',
      const Offset(72, 72),
      68,
      _cream,
      maxWidth: _posterWidth - 144,
      weight: FontWeight.w800,
    );
    _paintText(
      canvas,
      'GİRİŞ-ÇIXIŞ QR',
      const Offset(72, 160),
      34,
      _gold,
      maxWidth: _posterWidth - 144,
      weight: FontWeight.w600,
    );

    final qrBox = RRect.fromRectAndRadius(
      const Rect.fromLTWH(170, 340, 900, 900),
      const Radius.circular(32),
    );
    canvas.drawRRect(qrBox, Paint()..color = Colors.white);
    final qrPainter = QrPainter(
      data: data.qrPayload,
      version: QrVersions.auto,
      errorCorrectionLevel: QrErrorCorrectLevel.Q,
      gapless: true,
      eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: _burgundy),
      dataModuleStyle: const QrDataModuleStyle(
        dataModuleShape: QrDataModuleShape.square,
        color: _graphite,
      ),
    );
    canvas.save();
    canvas.translate(270, 440);
    qrPainter.paint(canvas, const Size(700, 700));
    canvas.restore();

    _paintText(
      canvas,
      data.orderTitle,
      const Offset(90, 1295),
      42,
      _burgundy,
      maxWidth: _posterWidth - 180,
      maxLines: 2,
      weight: FontWeight.w700,
      align: TextAlign.center,
    );
    _paintText(
      canvas,
      data.companyName,
      const Offset(90, 1405),
      28,
      _graphite,
      maxWidth: _posterWidth - 180,
      maxLines: 2,
      weight: FontWeight.w600,
      align: TextAlign.center,
    );
    _paintText(
      canvas,
      [
        if (data.location.trim().isNotEmpty) data.location.trim(),
        if (data.schedule?.trim().isNotEmpty == true) data.schedule!.trim(),
      ].join(' • '),
      const Offset(90, 1478),
      24,
      _graphite,
      maxWidth: _posterWidth - 180,
      maxLines: 2,
      align: TextAlign.center,
    );
    _paintText(
      canvas,
      'QR səhifəsini açın. Giriş və çıxış yalnız bu sifarişə qəbul olunmuş işçilər üçün mümkündür.',
      const Offset(90, 1580),
      22,
      _burgundy,
      maxWidth: _posterWidth - 180,
      maxLines: 3,
      weight: FontWeight.w600,
      align: TextAlign.center,
    );

    final picture = recorder.endRecording();
    final image = await picture.toImage(
      _posterWidth.toInt(),
      _posterHeight.toInt(),
    );
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    picture.dispose();
    if (byteData == null) {
      throw StateError('PNG poster could not be encoded.');
    }
    return byteData.buffer.asUint8List();
  }

  static Future<Uint8List> buildPdf(QrPosterData data) async {
    final document = pw.Document();
    final regular = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Inter-Regular.ttf'),
    );
    final bold = pw.Font.ttf(
      await rootBundle.load('assets/fonts/Inter-Bold.ttf'),
    );
    final burgundy = PdfColor.fromInt(_burgundy.toARGB32());
    final gold = PdfColor.fromInt(_gold.toARGB32());
    final cream = PdfColor.fromInt(_cream.toARGB32());
    final graphite = PdfColor.fromInt(_graphite.toARGB32());

    document.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: pw.EdgeInsets.zero,
        theme: pw.ThemeData.withFont(base: regular, bold: bold),
        build: (context) => pw.Container(
          color: cream,
          padding: const pw.EdgeInsets.symmetric(horizontal: 42, vertical: 48),
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: [
              pw.Container(
                color: burgundy,
                padding: const pw.EdgeInsets.all(24),
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(
                      'SET SERVICE',
                      style: pw.TextStyle(
                        color: cream,
                        fontSize: 28,
                        fontWeight: pw.FontWeight.bold,
                      ),
                    ),
                    pw.SizedBox(height: 8),
                    pw.Text(
                      'GİRİŞ-ÇIXIŞ QR',
                      style: pw.TextStyle(color: gold, fontSize: 14),
                    ),
                  ],
                ),
              ),
              pw.SizedBox(height: 30),
              pw.Container(
                color: PdfColors.white,
                padding: const pw.EdgeInsets.all(24),
                alignment: pw.Alignment.center,
                child: pw.BarcodeWidget(
                  barcode: pw.Barcode.qrCode(),
                  data: data.qrPayload,
                  width: 300,
                  height: 300,
                  drawText: false,
                  color: burgundy,
                ),
              ),
              pw.SizedBox(height: 28),
              pw.Text(
                data.orderTitle,
                textAlign: pw.TextAlign.center,
                style: pw.TextStyle(
                  color: burgundy,
                  fontSize: 20,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
              pw.SizedBox(height: 10),
              pw.Text(
                data.companyName,
                textAlign: pw.TextAlign.center,
                style: pw.TextStyle(
                  color: graphite,
                  fontSize: 14,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
              if (data.location.trim().isNotEmpty) ...[
                pw.SizedBox(height: 6),
                pw.Text(
                  data.location.trim(),
                  textAlign: pw.TextAlign.center,
                  style: pw.TextStyle(color: graphite, fontSize: 12),
                ),
              ],
              if (data.schedule?.trim().isNotEmpty == true) ...[
                pw.SizedBox(height: 4),
                pw.Text(
                  data.schedule!.trim(),
                  textAlign: pw.TextAlign.center,
                  style: pw.TextStyle(color: graphite, fontSize: 12),
                ),
              ],
              pw.Spacer(),
              pw.Container(
                decoration: pw.BoxDecoration(
                  border: pw.Border.all(color: gold, width: 1.5),
                  borderRadius: pw.BorderRadius.circular(8),
                ),
                padding: const pw.EdgeInsets.all(14),
                child: pw.Text(
                  'Bu poster sifarişin təhlükəsiz QR səhifəsini açır. Səhifə dinamik QR kodu hər 30 saniyədə yeniləyir; davamiyyət üçün işçinin bu sifarişə qəbul olunmuş təyinatı olmalıdır.',
                  textAlign: pw.TextAlign.center,
                  style: pw.TextStyle(
                    color: burgundy,
                    fontSize: 10,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
              ),
              pw.SizedBox(height: 12),
              pw.Text(
                data.printablePageUrl,
                textAlign: pw.TextAlign.center,
                style: pw.TextStyle(color: graphite, fontSize: 8),
              ),
            ],
          ),
        ),
      ),
    );
    return document.save();
  }

  static void _paintText(
    Canvas canvas,
    String value,
    Offset offset,
    double fontSize,
    Color color, {
    required double maxWidth,
    int maxLines = 1,
    FontWeight weight = FontWeight.w400,
    TextAlign align = TextAlign.left,
  }) {
    if (value.trim().isEmpty) return;
    final painter = TextPainter(
      text: TextSpan(
        text: value,
        style: TextStyle(
          color: color,
          fontSize: fontSize,
          fontFamily: 'Inter',
          fontWeight: weight,
          height: 1.2,
        ),
      ),
      textDirection: ui.TextDirection.ltr,
      textAlign: align,
      maxLines: maxLines,
      ellipsis: maxLines > 1 ? '…' : null,
    )..layout(maxWidth: maxWidth);
    final x = align == TextAlign.center
        ? offset.dx - painter.width / 2 + maxWidth / 2
        : offset.dx;
    painter.paint(canvas, Offset(x, offset.dy));
  }
}

class QrPosterShareService {
  const QrPosterShareService._();

  static Future<ShareResult> shareLink(
    QrPosterData data, {
    Rect? sharePositionOrigin,
  }) {
    return SharePlus.instance.share(
      ShareParams(
        uri: Uri.parse(data.stableUrl),
        title: 'SET Service QR',
        sharePositionOrigin: sharePositionOrigin,
      ),
    );
  }

  static Future<ShareResult> sharePng(
    QrPosterData data, {
    Rect? sharePositionOrigin,
  }) async {
    final bytes = await QrPosterExporter.buildPng(data);
    return SharePlus.instance.share(
      ShareParams(
        files: [XFile.fromData(bytes, mimeType: 'image/png')],
        fileNameOverrides: ['${data.fileStem}.png'],
        text: 'SET Service QR poster - ${data.orderTitle}',
        title: 'SET Service QR poster',
        sharePositionOrigin: sharePositionOrigin,
      ),
    );
  }

  static Future<ShareResult> sharePdf(
    QrPosterData data, {
    Rect? sharePositionOrigin,
  }) async {
    final bytes = await QrPosterExporter.buildPdf(data);
    return SharePlus.instance.share(
      ShareParams(
        files: [XFile.fromData(bytes, mimeType: 'application/pdf')],
        fileNameOverrides: ['${data.fileStem}.pdf'],
        text: 'SET Service QR poster - ${data.orderTitle}',
        title: 'SET Service QR poster',
        sharePositionOrigin: sharePositionOrigin,
      ),
    );
  }
}
