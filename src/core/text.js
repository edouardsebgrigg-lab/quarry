// Small wording helpers shared by the logic's messages and the UI.

// "a truck", "an excavator", "a utility digger" (a vowel letter that sounds like "you" or "won"
// takes "a").
export const withArticle = (word) => {
  const an = /^[aeiou]/i.test(word) && !/^(uni|use|usu|uti|eu|one)/i.test(word);
  return `${an ? 'an' : 'a'} ${word}`;
};
