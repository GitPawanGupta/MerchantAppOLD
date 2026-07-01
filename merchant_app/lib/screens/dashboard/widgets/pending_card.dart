import 'package:flutter/material.dart';
import '../../../core/widgets/app_widgets.dart';
import '../../../core/theme/app_theme.dart';

class PendingCard extends StatelessWidget {
  final double amount;
  final String preference;
  final VoidCallback? onSettle;

  const PendingCard({super.key, required this.amount, required this.preference, this.onSettle});

  @override
  Widget build(BuildContext context) {
    final isOnDemand = preference == 'on_demand';
    return GradientCard(
      gradient: AppTheme.accentGradient,
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Pending Settlement', style: TextStyle(color: Colors.white70, fontSize: 13)),
                  const SizedBox(height: 6),
                  AnimatedCounter(
                    value: amount,
                    formatter: formatCurrency,
                    style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.5),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(16)),
                child: const Icon(Icons.account_balance_wallet_outlined, color: Colors.white, size: 28),
              ),
            ],
          ),
          if (isOnDemand) ...[
            const SizedBox(height: 16),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppTheme.accentDark, elevation: 0, minimumSize: const Size.fromHeight(46), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
              onPressed: onSettle,
              child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.send_rounded, size: 18), SizedBox(width: 8), Text('Settle Now', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14))]),
            ),
          ] else ...[
            const SizedBox(height: 12),
            Row(children: const [Icon(Icons.autorenew, color: Colors.white70, size: 14), SizedBox(width: 6), Text('Auto-settlement enabled', style: TextStyle(color: Colors.white70, fontSize: 12))]),
          ],
        ],
      ),
    );
  }
}
