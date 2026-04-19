/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.0.204'],
  turbopack: {
    root: __dirname,
  },
}
module.exports = nextConfig
