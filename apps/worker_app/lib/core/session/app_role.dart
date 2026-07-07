enum AppRole {
  worker('worker'),
  company('company'),
  admin('super_admin');

  const AppRole(this.apiRole);

  final String apiRole;
}
