import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

class PremiumCard extends StatelessWidget {
  const PremiumCard({
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.onTap,
    this.dark = false,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Premium3DCard(
      padding: padding,
      onTap: onTap,
      dark: dark,
      child: child,
    );
  }
}

class Premium3DCard extends StatelessWidget {
  const Premium3DCard({
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.onTap,
    this.dark = false,
    this.radius = 26,
    this.depth = 1,
    this.accent,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final bool dark;
  final double radius;
  final double depth;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final borderRadius = BorderRadius.circular(radius);
    final accentColor = accent ?? BrandColors.accentGold;
    final content = AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: borderRadius,
        color: dark ? BrandColors.primaryBurgundy : BrandColors.cardCream,
        border: Border.all(
          color: dark
              ? BrandColors.accentGold.withValues(alpha: 0.38)
              : accentColor.withValues(alpha: 0.62),
        ),
      ),
      child: child,
    );

    if (onTap == null) return content;

    return _PremiumPressScale(
      borderRadius: borderRadius,
      onTap: onTap!,
      child: content,
    );
  }
}

class _PremiumPressScale extends StatefulWidget {
  const _PremiumPressScale({
    required this.child,
    required this.borderRadius,
    required this.onTap,
  });

  final Widget child;
  final BorderRadius borderRadius;
  final VoidCallback onTap;

  @override
  State<_PremiumPressScale> createState() => _PremiumPressScaleState();
}

class _PremiumPressScaleState extends State<_PremiumPressScale> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: _pressed ? 0.985 : 1,
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOutCubic,
      child: Material(
        color: BrandColors.transparent,
        child: InkWell(
          borderRadius: widget.borderRadius,
          onTap: widget.onTap,
          onTapDown: (_) => setState(() => _pressed = true),
          onTapUp: (_) => setState(() => _pressed = false),
          onTapCancel: () => setState(() => _pressed = false),
          child: widget.child,
        ),
      ),
    );
  }
}

class PremiumEntrance extends StatelessWidget {
  const PremiumEntrance({
    required this.child,
    this.delay = Duration.zero,
    this.offset = const Offset(0, 18),
    super.key,
  });

  final Widget child;
  final Duration delay;
  final Offset offset;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 520 + delay.inMilliseconds),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        final delayed = delay == Duration.zero
            ? value
            : ((value * (520 + delay.inMilliseconds) - delay.inMilliseconds) /
                      520)
                  .clamp(0.0, 1.0);
        return Opacity(
          opacity: delayed,
          child: Transform.translate(
            offset: Offset(
              offset.dx * (1 - delayed),
              offset.dy * (1 - delayed),
            ),
            child: Transform.scale(scale: 0.98 + delayed * 0.02, child: child),
          ),
        );
      },
      child: child,
    );
  }
}

class PremiumHeroPanel extends StatelessWidget {
  const PremiumHeroPanel({
    required this.title,
    required this.subtitle,
    this.leading,
    this.trailing,
    this.children = const [],
    this.compact = false,
    super.key,
  });

  final String title;
  final String subtitle;
  final Widget? leading;
  final Widget? trailing;
  final List<Widget> children;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return AnimatedHeroPanel(
      padding: EdgeInsets.all(compact ? 18 : 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (leading != null) ...[leading!, const SizedBox(width: 14)],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(
                            color: BrandColors.white,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      subtitle,
                      maxLines: compact ? 2 : 3,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: BrandColors.softBeige,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 12), trailing!],
            ],
          ),
          if (children.isNotEmpty) ...[const SizedBox(height: 18), ...children],
        ],
      ),
    );
  }
}

class AnimatedHeroPanel extends StatelessWidget {
  const AnimatedHeroPanel({
    required this.child,
    this.padding = const EdgeInsets.all(22),
    this.height,
    this.radius = 28,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double? height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return PremiumEntrance(
      offset: const Offset(0, 12),
      child: Container(
        height: height,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              BrandColors.primaryBurgundy,
              BrandColors.primaryBurgundy,
              BrandColors.deepBurgundy,
            ],
          ),
          boxShadow: [
            BoxShadow(
              color: BrandColors.primaryBurgundy.withValues(alpha: 0.28),
              blurRadius: 36,
              offset: const Offset(0, 22),
            ),
          ],
        ),
        child: Stack(
          children: [
            const Positioned(
              right: -44,
              top: -50,
              child: FloatingBrandShape(size: 150, opacity: 0.16),
            ),
            const Positioned(
              left: -30,
              bottom: -52,
              child: FloatingBrandShape(size: 116, opacity: 0.11),
            ),
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      BrandColors.white.withValues(alpha: 0.09),
                      BrandColors.transparent,
                    ],
                  ),
                ),
              ),
            ),
            Padding(padding: padding, child: child),
          ],
        ),
      ),
    );
  }
}

class FloatingBrandShape extends StatefulWidget {
  const FloatingBrandShape({
    this.size = 120,
    this.opacity = 0.18,
    this.color = BrandColors.accentGold,
    super.key,
  });

  final double size;
  final double opacity;
  final Color color;

  @override
  State<FloatingBrandShape> createState() => _FloatingBrandShapeState();
}

class _FloatingBrandShapeState extends State<FloatingBrandShape>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 4200),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final lift = (_controller.value - 0.5) * 10;
        return Transform.translate(
          offset: Offset(0, lift),
          child: Transform.rotate(
            angle: (_controller.value - 0.5) * 0.08,
            child: child,
          ),
        );
      },
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(widget.size * 0.32),
          gradient: RadialGradient(
            center: Alignment.topLeft,
            colors: [
              BrandColors.white.withValues(alpha: widget.opacity * 0.75),
              widget.color.withValues(alpha: widget.opacity),
              BrandColors.primaryBurgundy.withValues(
                alpha: widget.opacity * 0.45,
              ),
            ],
          ),
          boxShadow: [
            BoxShadow(
              color: widget.color.withValues(alpha: widget.opacity * 0.7),
              blurRadius: 28,
              offset: const Offset(0, 14),
            ),
          ],
        ),
      ),
    );
  }
}

class PremiumStatTile extends StatelessWidget {
  const PremiumStatTile({
    required this.label,
    required this.value,
    required this.icon,
    this.accent = BrandColors.primaryBurgundy,
    super.key,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return PremiumStatCard(
      label: label,
      value: value,
      icon: icon,
      accent: accent,
    );
  }
}

class PremiumStatCard extends StatelessWidget {
  const PremiumStatCard({
    required this.label,
    required this.value,
    required this.icon,
    this.accent = BrandColors.primaryBurgundy,
    super.key,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Premium3DCard(
      padding: const EdgeInsets.all(17),
      accent: accent,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: accent.withValues(alpha: 0.12)),
                ),
                child: Icon(icon, color: accent, size: 22),
              ),
              const Spacer(),
              Text(
                value,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  height: 1,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: BrandColors.mutedBrown,
              fontWeight: FontWeight.w600,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    required this.title,
    this.subtitle,
    this.action,
    super.key,
  });

  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 6, 2, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                    height: 1.1,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle!,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: BrandColors.mutedBrown,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (action != null) ...[const SizedBox(width: 12), action!],
        ],
      ),
    );
  }
}

class ActionTile extends StatelessWidget {
  const ActionTile({
    required this.title,
    required this.subtitle,
    required this.icon,
    this.onTap,
    this.accent = BrandColors.primaryBurgundy,
    super.key,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback? onTap;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Premium3DCard(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      accent: accent,
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  accent.withValues(alpha: 0.14),
                  BrandColors.accentGold.withValues(alpha: 0.12),
                ],
              ),
            ),
            child: Icon(icon, color: accent),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: BrandColors.mutedBrown,
                    height: 1.25,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Icon(Icons.arrow_forward_rounded, color: accent),
        ],
      ),
    );
  }
}

class PremiumActionButton extends StatefulWidget {
  const PremiumActionButton({
    required this.label,
    required this.onPressed,
    this.icon,
    this.secondary = false,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool secondary;

  @override
  State<PremiumActionButton> createState() => _PremiumActionButtonState();
}

class _PremiumActionButtonState extends State<PremiumActionButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null;
    final radius = BorderRadius.circular(20);
    return AnimatedScale(
      scale: _pressed && enabled ? 0.975 : 1,
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOutCubic,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: radius,
          boxShadow: [
            if (!widget.secondary && enabled)
              BoxShadow(
                color: BrandColors.primaryBurgundy.withValues(alpha: 0.22),
                blurRadius: 22,
                offset: const Offset(0, 12),
              ),
          ],
        ),
        child: Material(
          color: widget.secondary
              ? BrandColors.cardCream
              : BrandColors.primaryBurgundy,
          borderRadius: radius,
          child: InkWell(
            borderRadius: radius,
            onTap: widget.onPressed,
            onTapDown: (_) => setState(() => _pressed = true),
            onTapUp: (_) => setState(() => _pressed = false),
            onTapCancel: () => setState(() => _pressed = false),
            child: Container(
              constraints: const BoxConstraints(minHeight: 56),
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              decoration: BoxDecoration(
                borderRadius: radius,
                border: Border.all(
                  color: widget.secondary
                      ? BrandColors.accentGold.withValues(alpha: 0.36)
                      : BrandColors.accentGold.withValues(alpha: 0.18),
                ),
                gradient: widget.secondary
                    ? null
                    : const LinearGradient(
                        colors: [
                          BrandColors.primaryBurgundy,
                          BrandColors.darkBurgundy,
                        ],
                      ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (widget.icon != null) ...[
                    Icon(
                      widget.icon,
                      color: widget.secondary
                          ? BrandColors.primaryBurgundy
                          : BrandColors.white,
                    ),
                    const SizedBox(width: 10),
                  ],
                  Flexible(
                    child: Text(
                      widget.label,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: widget.secondary
                            ? BrandColors.primaryBurgundy
                            : BrandColors.white,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class AnimatedStatusChip extends StatelessWidget {
  const AnimatedStatusChip({
    required this.label,
    required this.icon,
    required this.color,
    super.key,
  });

  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final isGold = color == BrandColors.accentGold;
    final foreground = isGold ? BrandColors.darkText : color;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.96, end: 1),
      duration: const Duration(milliseconds: 360),
      curve: Curves.easeOutBack,
      builder: (context, value, child) {
        return Transform.scale(scale: value, child: child);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: isGold ? 0.24 : 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: 0.25)),
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.08),
              blurRadius: 10,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: foreground),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: foreground,
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class PremiumEmptyState extends StatelessWidget {
  const PremiumEmptyState({
    required this.title,
    required this.message,
    this.icon = Icons.inbox_outlined,
    this.action,
    super.key,
  });

  final String title;
  final String message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Premium3DCard(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: BrandColors.accentGold.withValues(alpha: 0.12),
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: BrandColors.accentGold.withValues(alpha: 0.16),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Icon(icon, color: BrandColors.accentGold, size: 34),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: BrandColors.mutedBrown,
                height: 1.35,
              ),
            ),
            if (action != null) ...[const SizedBox(height: 18), action!],
          ],
        ),
      ),
    );
  }
}

class SkeletonShimmer extends StatelessWidget {
  const SkeletonShimmer({
    this.height = 18,
    this.width,
    this.radius = 14,
    super.key,
  });

  final double height;
  final double? width;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return SkeletonBlock(height: height, width: width, radius: radius);
  }
}

class SkeletonShimmerGroup extends StatefulWidget {
  const SkeletonShimmerGroup({required this.child, super.key});

  final Widget child;

  @override
  State<SkeletonShimmerGroup> createState() => _SkeletonShimmerGroupState();
}

class _SkeletonShimmerGroupState extends State<SkeletonShimmerGroup>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SkeletonAnimationScope(animation: _controller, child: widget.child);
  }
}

class _SkeletonAnimationScope extends InheritedWidget {
  const _SkeletonAnimationScope({
    required this.animation,
    required super.child,
  });

  final Animation<double> animation;

  static Animation<double>? maybeOf(BuildContext context) {
    return context
        .dependOnInheritedWidgetOfExactType<_SkeletonAnimationScope>()
        ?.animation;
  }

  @override
  bool updateShouldNotify(_SkeletonAnimationScope oldWidget) {
    return animation != oldWidget.animation;
  }
}

class SkeletonBlock extends StatelessWidget {
  const SkeletonBlock({
    this.height = 18,
    this.width,
    this.radius = 14,
    super.key,
  });

  final double height;
  final double? width;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final sharedAnimation = _SkeletonAnimationScope.maybeOf(context);
    if (sharedAnimation != null) {
      return _AnimatedSkeletonBlock(
        animation: sharedAnimation,
        height: height,
        width: width,
        radius: radius,
      );
    }
    return _StandaloneSkeletonBlock(
      height: height,
      width: width,
      radius: radius,
    );
  }
}

class _StandaloneSkeletonBlock extends StatefulWidget {
  const _StandaloneSkeletonBlock({
    required this.height,
    required this.width,
    required this.radius,
  });

  final double height;
  final double? width;
  final double radius;

  @override
  State<_StandaloneSkeletonBlock> createState() =>
      _StandaloneSkeletonBlockState();
}

class _StandaloneSkeletonBlockState extends State<_StandaloneSkeletonBlock>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _AnimatedSkeletonBlock(
      animation: _controller,
      height: widget.height,
      width: widget.width,
      radius: widget.radius,
    );
  }
}

class _AnimatedSkeletonBlock extends StatelessWidget {
  const _AnimatedSkeletonBlock({
    required this.animation,
    required this.height,
    required this.width,
    required this.radius,
  });

  final Animation<double> animation;
  final double height;
  final double? width;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) {
        return Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius),
            gradient: LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              stops: const [0.1, 0.5, 0.9],
              colors: [
                BrandColors.softBeige.withValues(alpha: 0.48),
                BrandColors.white.withValues(alpha: 0.8),
                BrandColors.softBeige.withValues(alpha: 0.48),
              ],
              transform: _SlidingGradientTransform(animation.value),
            ),
          ),
        );
      },
    );
  }
}

class PremiumListSkeleton extends StatelessWidget {
  const PremiumListSkeleton({this.itemCount = 3, super.key});

  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return SkeletonShimmerGroup(
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: itemCount,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          return const PremiumCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonBlock(height: 18, width: 160),
                SizedBox(height: 14),
                SkeletonBlock(height: 14),
                SizedBox(height: 8),
                SkeletonBlock(height: 14, width: 220),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _SlidingGradientTransform extends GradientTransform {
  const _SlidingGradientTransform(this.value);

  final double value;

  @override
  Matrix4 transform(Rect bounds, {TextDirection? textDirection}) {
    return Matrix4.translationValues(bounds.width * (value * 2 - 1), 0, 0);
  }
}

class PremiumChip extends StatelessWidget {
  const PremiumChip({
    required this.label,
    this.icon,
    this.dark = false,
    super.key,
  });

  final String label;
  final IconData? icon;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final fg = dark ? BrandColors.white : BrandColors.primaryBurgundy;
    final bg = dark
        ? BrandColors.white.withValues(alpha: 0.1)
        : BrandColors.accentGold.withValues(alpha: 0.12);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: BrandColors.accentGold.withValues(alpha: dark ? 0.26 : 0.2),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 15, color: fg),
            const SizedBox(width: 6),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: fg,
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class PremiumBottomSheet extends StatelessWidget {
  const PremiumBottomSheet({required this.child, this.title, super.key});

  final Widget child;
  final String? title;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 4, 18, 22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 44,
                height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: BrandColors.softBeige,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            if (title != null) ...[
              Text(title!, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 14),
            ],
            Flexible(child: SingleChildScrollView(child: child)),
          ],
        ),
      ),
    );
  }
}

Future<T?> showPremiumBottomSheet<T>({
  required BuildContext context,
  required Widget child,
  String? title,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    showDragHandle: false,
    backgroundColor: BrandColors.creamBackground,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (sheetContext) => AnimatedPadding(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      padding: EdgeInsets.only(
        bottom: MediaQuery.viewInsetsOf(sheetContext).bottom,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.9,
        ),
        child: PremiumBottomSheet(title: title, child: child),
      ),
    ),
  );
}
