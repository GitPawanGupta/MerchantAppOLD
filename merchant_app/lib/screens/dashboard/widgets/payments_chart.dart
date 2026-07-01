import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../../core/theme/app_theme.dart';

/// A simple bar chart visualizing daily payment amounts.
///
/// The widget expects a list of data points where each point is a map with
/// `date` (String) and `amount` (double). The chart displays the amount as a
/// vertical bar and the date as the X‑axis label.
class PaymentsChart extends StatelessWidget {
  final List<Map<String, dynamic>> data;

  const PaymentsChart({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return const Center(
        child: Text(
          'No payment data available',
          style: TextStyle(color: AppTheme.textSecondary),
        ),
      );
    }

    // Convert data to FlSpot for the line chart.
    final barGroups = data.asMap().entries.map((e) {
      final idx = e.key;
      final amount = (e.value['amount'] as num?)?.toDouble() ?? 0;
      return BarChartGroupData(x: idx, barRods: [
        BarChartRodData(
          toY: amount,
          color: AppTheme.primary,
          width: 16,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
        ),
      ]);
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Payments Overview',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: AppTheme.textPrimary,
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 200,
          child: BarChart(
            BarChartData(
              barGroups: barGroups,
              titlesData: FlTitlesData(
                leftTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 40,
                    interval: _calcYInterval(),
                    getTitlesWidget: (value, meta) {
                      return Text(
                        '₹${value.toInt()}',
                        style: const TextStyle(
                          fontSize: 10,
                          color: AppTheme.textSecondary,
                          fontWeight: FontWeight.w500,
                        ),
                      );
                    },
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (value, meta) {
                      final idx = value.toInt();
                      if (idx < 0 || idx >= data.length) return const SizedBox.shrink();
                      final date = data[idx]['date'] as String? ?? '';
                      return Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          date,
                          style: const TextStyle(
                            fontSize: 10,
                            color: AppTheme.textSecondary,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      );
                    },
                  ),
                ),
                topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
              ),
              gridData: FlGridData(show: false),
              borderData: FlBorderData(show: false),
            ),
          ),
        ),
      ],
    );
  }

  double _calcYInterval() {
    // Simple heuristic: divide max value by 4.
    final max = data.map((e) => (e['amount'] as num?)?.toDouble() ?? 0).fold(0.0, (a, b) => a > b ? a : b);
    if (max == 0) return 1;
    return (max / 4).ceilToDouble();
  }
}
