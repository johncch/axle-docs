import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Axle',
  description: 'A small, focused TypeScript library for building multi-turn LLM agents.',
  cleanUrls: true,
  themeConfig: {
    siteTitle: 'Axle',
    nav: [
      { text: 'v0.24.0', link: '/changelog' },
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Installation', link: '/getting-started/installation' },
          { text: 'Quick Start', link: '/getting-started/quick-start' },
        ],
      },
      {
        text: 'Guide',
        items: [
          { text: 'Agent', link: '/guide/agent' },
          { text: 'Instruct', link: '/guide/instruct' },
          { text: 'Providers', link: '/guide/providers' },
          { text: 'Tools', link: '/guide/tools' },
          { text: 'Provider Tools', link: '/guide/provider-tools' },
          { text: 'MCP', link: '/guide/mcp' },
          { text: 'Streaming', link: '/guide/streaming' },
          { text: 'Results & Errors', link: '/guide/results' },
          { text: 'Low-level APIs', link: '/guide/low-level' },
          { text: 'Hosting & Sessions', link: '/guide/hosting' },
        ],
      },
      {
        text: 'Examples',
        items: [
          { text: 'Agent with tools', link: '/examples/simple-agent' },
          { text: 'Structured output', link: '/examples/simple-schema' },
          { text: 'Reasoning', link: '/examples/simple-reasoning' },
          { text: 'Procedural memory', link: '/examples/simple-memory' },
          { text: 'Provider tools', link: '/examples/simple-provider-tools' },
          { text: 'generate()', link: '/examples/simple-generate' },
          { text: 'generate() + Instruct', link: '/examples/simple-generate-instruct' },
          { text: 'stream()', link: '/examples/simple-stream' },
          { text: 'stream() + Instruct', link: '/examples/simple-stream-instruct' },
          { text: 'Cancelling a stream', link: '/examples/simple-stream-cancellation' },
          { text: 'Streaming tool output', link: '/examples/simple-tool-stream' },
          { text: 'Local image', link: '/examples/simple-image' },
          { text: 'Image by URL', link: '/examples/simple-image-url' },
          { text: 'PDF', link: '/examples/simple-pdf' },
          { text: 'File references', link: '/examples/simple-files' },
          { text: 'Tool returning a file', link: '/examples/simple-tool-with-file' },
          { text: 'MCP servers', link: '/examples/simple-mcp' },
        ],
      },
      {
        text: 'CLI',
        items: [
          { text: 'Overview', link: '/cli/overview' },
          { text: 'Batch', link: '/cli/batch' },
          { text: 'MCP Servers', link: '/cli/mcp' },
          { text: 'Configuration', link: '/cli/configuration' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'Migration: 0.24.0', link: '/migration/0.24.0' },
          { text: 'Migration: 0.23.0', link: '/migration/0.23.0' },
          { text: 'Migration: 0.22.0', link: '/migration/0.22.0' },
          { text: 'Migration: 0.21.0', link: '/migration/0.21.0' },
          { text: 'Migration: 0.20.0', link: '/migration/0.20.0' },
          { text: 'Migration: 0.19.0', link: '/migration/0.19.0' },
          { text: 'Migration: 0.18.0', link: '/migration/0.18.0' },
          { text: 'Migration: 0.17.0', link: '/migration/0.17.0' },
          { text: 'Migration: 0.13.0', link: '/migration/0.13.0' },
        ],
      },
    ],
    outline: { level: [2, 3], label: 'On this page' },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/johncch/axle' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@fifthrevision/axle' },
    ],
  },
});
