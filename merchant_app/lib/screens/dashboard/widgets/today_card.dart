import 'package:flutter/material.dart';
import '../../../core/widgets/app_widgets.dart';
import '../../../core/theme/app_theme.dart';

class TodayCard extends StatelessWidget {
  final Map<String, dynamic> today;

  const TodayCard({super.key, required this.today});

  @override
  Widget build(BuildContext context) {
    final count = today['count'] ?? 0;
    final total = (today['total'] as num?)?.toDouble() ?? 0;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE8EEF4)),
        boxShadow: AppTheme.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.today_rounded, size: 16, color: AppTheme.primary),
              ),
              const SizedBox(width: 8),
              const Text(
                "Today's Summary",
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              MetricTile(label: 'Payments', value: '$count'),
              Container(height: 36, width: 1, color: AppTheme.divider),
              MetricTile(label: 'Collected', value: formatCurrency(total)),
            ],
          ),
        ],
      ),
    );
  }
}
