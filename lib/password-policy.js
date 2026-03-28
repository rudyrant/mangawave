const COMMON_PASSWORDS = new Set([
  "123456",
  "123456789",
  "12345678",
  "password",
  "password1",
  "qwerty",
  "qwerty123",
  "111111",
  "000000",
  "abc123",
  "iloveyou",
  "admin",
  "welcome",
  "letmein",
  "monkey",
  "dragon",
  "baseball",
  "football",
  "master",
  "shadow",
  "superman",
  "ashley",
  "trustno1",
  "passw0rd",
  "654321",
  "987654321",
  "zaq12wsx",
  "1q2w3e4r",
  "qwertyuiop",
  "changeme",
  "changeme123",
]);

export function validatePasswordStrength(password, hints = []) {
  const value = String(password || "");
  if (value.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const normalized = value.toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    throw new Error("Choose a less common password.");
  }

  if (/^(.){7,}$/.test(value)) {
    throw new Error("Choose a less predictable password.");
  }

  for (const hint of hints) {
    const normalizedHint = String(hint || "").trim().toLowerCase();
    if (normalizedHint && normalized.includes(normalizedHint)) {
      throw new Error("Password should not contain your email or username.");
    }
  }

  return true;
}
