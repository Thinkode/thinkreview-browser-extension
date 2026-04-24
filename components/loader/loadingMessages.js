/**
 * Educational tech and AI facts (aligned with Thinkreview-webapp loading UX).
 */
export const loadingFacts = [
  'The first computer mouse, invented in 1964 by Doug Engelbart, was made of wood.',
  'The term "bug" for a computer glitch was popularized by Grace Hopper in 1947 after finding a real moth in a relay.',
  'The first AI program, "Logic Theorist", was written in 1955 by Allen Newell, Cliff Shaw, and Herbert Simon.',
  'ARPANET, the precursor to the internet, successfully sent its first message in 1969. It was "LO" (the system crashed before finishing "LOGIN").',
  'The first domain name ever registered was symbolics.com on March 15, 1985.',
  "The world's first website and web browser were created by Tim Berners-Lee in 1990 at CERN.",
  'The first 1GB hard drive was announced by IBM in 1980. It weighed over 500 pounds and cost $40,000.',
  'The QWERTY keyboard layout was designed in 1873 to slow down typists and prevent typewriter keys from jamming.',
  'JavaScript was created by Brendan Eich in just 10 days in May 1995.',
  'The first 10-megabyte hard drive cost $3,495 when it was introduced by Apple in 1981.',
  'CAPTCHA stands for "Completely Automated Public Turing test to tell Computers and Humans Apart."',
  'The first webcam was created at Cambridge University in 1991 to monitor the level of a coffee pot in the lab.',
  'The name "Google" was originally a misspelling of "Googol", which is the number 1 followed by 100 zeros.',
  'The first computer virus, known as "Creeper", was created in 1971 by Bob Thomas as an experimental self-duplicating program.',
  "IBM's Deep Blue became the first computer to beat a reigning world chess champion, Garry Kasparov, in 1997.",
  'The Python programming language was named after the British comedy group Monty Python, not the snake.',
  'The first mobile phone call was made by Martin Cooper in 1973 using a Motorola DynaTAC that weighed 2.5 pounds.',
  'The Apollo 11 Guidance Computer that took humanity to the moon operated at 0.043 MHz and had only 4KB of RAM.',
  'Alan Turing introduced the concept of the Turing Test in his 1950 paper "Computing Machinery and Intelligence."',
  'More than 50% of global internet traffic is currently driven by bots, both malicious and benign.',
];

export function getRandomFact() {
  return loadingFacts[Math.floor(Math.random() * loadingFacts.length)];
}
