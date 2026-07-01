import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/app_widgets.dart';

class StatsGrid extends StatelessWidget {
  final Map<String, dynamic> summary;

  const StatsGrid({super.key, required this.summary});

  @override
  Widget build(BuildContext context) {
    final s = summary['summary'] as Map<String, dynamic>? ?? {};
    final today = summary['today'] as Map<String, dynamic>? ?? {};
    return Column(
      children: [
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: StatCard(
                  label: 'Total Collected',
                  value: formatCurrency((s['totalCollected'] as num?)?.toDouble() ?? 0),
                  icon: Icons.trending_up_rounded,
                  iconColor: AppTheme.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: StatCard(
                  label: 'Total Settled',
                  value: formatCurrency((s['totalSettled'] as num?)?.toDouble() ?? 0),
                  icon: Icons.check_circle_outline_rounded,
                  iconColor: AppTheme.accent,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: StatCard(
                  label: 'Pending Amount',
                  value: formatCurrency((s['pendingSettlement'] as num?)?.toDouble() ?? 0),
                  icon: Icons.hourglass_top_rounded,
                  iconColor: AppTheme.info,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: StatCard(
                  label: "Today's Payments",
                  value: '${today['count'] ?? 0}',
                  icon: Icons.receipt_long_outlined,
                  iconColor: AppTheme.warning,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
