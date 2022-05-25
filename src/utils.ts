export const removeTrailingSlashes = (input: string) => {
  let output = input
  while (output.endsWith('/')) {
    output = output.slice(0, -1)
  }
  return output
}