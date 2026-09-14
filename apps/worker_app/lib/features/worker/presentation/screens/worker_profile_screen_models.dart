part of 'worker_profile_screen.dart';

class _ExperienceDraft {
  _ExperienceDraft({
    String companyName = '',
    String position = '',
    String note = '',
  }) : companyController = TextEditingController(text: companyName),
       positionController = TextEditingController(text: position),
       noteController = TextEditingController(text: note);

  factory _ExperienceDraft.fromExperience(WorkerExperience experience) {
    return _ExperienceDraft(
      companyName: experience.companyName,
      position: experience.position,
      note: experience.note,
    );
  }

  final TextEditingController companyController;
  final TextEditingController positionController;
  final TextEditingController noteController;

  void dispose() {
    companyController.dispose();
    positionController.dispose();
    noteController.dispose();
  }
}

String _documentLabel(String type) {
  return switch (type) {
    'health_certificate' => 'Sağlamlıq arayışı',
    'criminal_record' => 'Məhkumluq arayışı',
    _ => type,
  };
}
