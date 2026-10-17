/**
 * Name validation & profanity filter for user profile creation.
 * Filters out swear words, slurs, crude vulgarities, and common leetspeak variants
 * while allowing normal names (e.g. Cassandra, Bass Player, etc.).
 */

const BLOCKED_SUBSTRINGS = [
  'fuck', 'fck', 'fuk', 'shit', 'shat', 'cunt', 'bitch', 'nigg', 'fagg', 'whore', 'slut',
  'twat', 'wank', 'pussy', 'blowjob', 'dildo', 'kike', 'spic', 'chink',
  'retard', 'nazi', 'hitler', 'asshole', 'motherfuck'
];

const BLOCKED_WORDS = [
  'ass', 'dick', 'cock', 'prick', 'tit', 'tits', 'boob', 'boobs',
  'penis', 'vagina', 'porn', 'bastard', 'crap', 'sex'
];

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\*_\-#]/g, '')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i')
    .replace(/1/g, 'i')
    .replace(/0/g, 'o')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b');
}

export function validateName(name: string): { isValid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Please enter your name.' };
  }
  if (trimmed.length < 2) {
    return { isValid: false, error: 'Name must be at least 2 characters long.' };
  }
  if (trimmed.length > 30) {
    return { isValid: false, error: 'Name must be 30 characters or less.' };
  }

  if (trimmed.toLowerCase() === 'glyn johns') {
    return { isValid: false, error: '"Glyn Johns" is reserved as the benchmark reference participant.' };
  }

  const norm = normalize(trimmed);
  const stripped = norm.replace(/[^a-z0-9]/g, '');

  // Check substrings in stripped string
  for (const bad of BLOCKED_SUBSTRINGS) {
    if (stripped.includes(bad)) {
      return { isValid: false, error: 'Please choose an appropriate name without offensive language.' };
    }
  }

  // Regex patterns for common evasions (f*ck, sh!t, etc.)
  if (/f[\W_]*[u*][\W_]*c[\W_]*k/i.test(trimmed)) {
    return { isValid: false, error: 'Please choose an appropriate name without offensive language.' };
  }
  if (/s[\W_]*[h*][\W_]*[i!*1][\W_]*t/i.test(trimmed)) {
    return { isValid: false, error: 'Please choose an appropriate name without offensive language.' };
  }
  if (/b[\W_]*[i!*1][\W_]*t[\W_]*c[\W_]*h/i.test(trimmed)) {
    return { isValid: false, error: 'Please choose an appropriate name without offensive language.' };
  }
  if (/c[\W_]*[u*][\W_]*n[\W_]*t/i.test(trimmed)) {
    return { isValid: false, error: 'Please choose an appropriate name without offensive language.' };
  }

  // Check words (tokenized)
  const tokens = norm.split(/[^a-z0-9]+/);
  for (const token of tokens) {
    if (BLOCKED_WORDS.includes(token) || BLOCKED_SUBSTRINGS.includes(token)) {
      return { isValid: false, error: 'Please choose an appropriate name without offensive language.' };
    }
  }

  return { isValid: true };
}
