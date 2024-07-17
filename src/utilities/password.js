export const validatePassword = (password) => {
  var passwordRegex = /(?=.*[0-9a-zA-Z]).{6,}/;
  return passwordRegex.test(password);
}