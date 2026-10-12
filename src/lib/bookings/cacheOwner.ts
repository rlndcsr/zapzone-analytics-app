export function createOwnerGuard<T>(reset: () => void): (owner: T) => void {
  let seen = false;
  let current: T | undefined;
  return (owner) => {
    if (seen && owner === current) return;
    seen = true;
    current = owner;
    reset();
  };
}
