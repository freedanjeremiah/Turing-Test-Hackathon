/** @type {import('next').NextConfig} */
const nextConfig = {
  // @pantheon/shared and @pantheon/hl-client ship TypeScript source (their package
  // `exports` point at .ts files), so Next must transpile them rather than
  // treat them as pre-built node_modules.
  transpilePackages: ["@pantheon/shared", "@pantheon/hl-client"],
};

module.exports = nextConfig;
