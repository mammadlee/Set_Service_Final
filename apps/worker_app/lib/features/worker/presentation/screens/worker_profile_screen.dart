import 'package:file_picker/file_picker.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_exception.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/constrained_page.dart';
import '../../../../shared/widgets/inline_message.dart';
import '../../../../shared/widgets/loading_button.dart';
import '../../../../shared/widgets/premium_components.dart';
import '../../../auth/data/models/auth_models.dart';
import '../../../taxonomy/data/taxonomy_repository.dart';
import '../../data/worker_repository.dart';

part 'worker_profile_screen_state.dart';
part 'worker_profile_screen_widgets.dart';
part 'worker_profile_screen_sections.dart';
part 'worker_profile_screen_models.dart';
