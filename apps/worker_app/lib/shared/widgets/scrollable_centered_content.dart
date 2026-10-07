import 'package:flutter/material.dart';

class ScrollableCenteredContent extends StatelessWidget {
  const ScrollableCenteredContent({
    required this.child,
    this.physics = const AlwaysScrollableScrollPhysics(),
    super.key,
  });

  final Widget child;
  final ScrollPhysics physics;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: physics,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            minHeight: constraints.hasBoundedHeight ? constraints.maxHeight : 0,
          ),
          child: Center(child: child),
        ),
      ),
    );
  }
}
