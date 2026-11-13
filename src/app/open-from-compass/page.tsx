/**
 * Where anyone lands who is not signed in. Sigma Read has no sign-in of its own: Compass opens
 * it with the student's (or the admin's) signed note, and that is the only way in.
 */
export default function OpenFromCompass() {
  return (
    <div className="flex items-center justify-center min-h-screen px-6">
      <div className="max-w-sm text-center">
        <p className="text-lg font-semibold">Open Sigma Read from Compass</p>
        <p className="text-sm text-[var(--muted)] mt-2">
          Students: choose Reading in Compass. Admins: open Sigma Read from the Apps tab in Compass Admin.
        </p>
      </div>
    </div>
  );
}
