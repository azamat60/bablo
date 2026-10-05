let profile: string | undefined;
export function configureProfile(userId?: string) {
  profile = userId;
}
export function profileDatabaseName() {
  return profile ? `bablo-user-${profile}` : 'bablo';
}
