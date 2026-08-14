import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Axle',
  description: 'A small, focused TypeScript library for building multi-turn LLM agents.',
  cleanUrls: true,
  themeConfig: {
    siteTitle: 'Axle',
    nav: [
      { text: 'Guide', link: '/', activeMatch: '^/$|/(getting-started|concepts)/' },
      { text: 'Reference', link: '/reference/agent', activeMatch: '/reference/' },
      { text: 'Cookbook', link: '/cookbook/tool-using-agent', activeMatch: '/cookbook/' },
      {
        text: 'v0.30.1',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'Upgrading', link: '/upgrading' },
          { text: 'Glossary', link: '/glossary' },
        ],
      },
    ],
    search: {
      provider: 'local',
    },
    docFooter: {
      prev: 'Previous',
      next: 'Next',
    },
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
        text: 'Agent',
        items: [
          { text: 'Agent', link: '/concepts/agent' },
          { text: 'Anatomy of a send', link: '/concepts/anatomy-of-a-send' },
          { text: 'Turns & Transcripts', link: '/concepts/transcripts' },
          { text: 'Turn events', link: '/concepts/turn-events' },
          { text: 'Sessions & persistence', link: '/concepts/sessions' },
          { text: 'Compaction', link: '/concepts/compaction' },
        ],
      },
      {
        text: 'Primitives',
        items: [
          { text: 'generate() & stream()', link: '/concepts/generate-and-stream' },
          { text: 'Stream events', link: '/concepts/stream-events' },
        ],
      },
      {
        text: 'Building blocks',
        items: [
          { text: 'Providers & models', link: '/concepts/providers' },
          { text: 'Instruct', link: '/concepts/instruct' },
          { text: 'Tools', link: '/concepts/tools' },
          { text: 'The tool registry', link: '/concepts/tool-registry' },
          { text: 'Results & errors', link: '/concepts/results-and-errors' },
          { text: 'Observability', link: '/concepts/observability' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Agent', link: '/reference/agent' },
          { text: 'Instruct', link: '/reference/instruct' },
          { text: 'Providers', link: '/reference/providers' },
          { text: 'generate() & stream()', link: '/reference/generate-stream' },
          { text: 'Tools', link: '/reference/tools' },
          { text: 'MCP', link: '/reference/mcp' },
          { text: 'Transcript & turn events', link: '/reference/transcript' },
          { text: 'Messages & parts', link: '/reference/messages' },
          { text: 'Errors', link: '/reference/errors' },
          { text: 'Observability', link: '/reference/observability' },
          { text: 'Configuration', link: '/reference/configuration' },
        ],
      },
      {
        text: 'Cookbook',
        items: [
          { text: 'Tool-using agent', link: '/cookbook/tool-using-agent' },
          { text: 'Structured output', link: '/cookbook/structured-output' },
          { text: 'Streaming to a UI', link: '/cookbook/streaming-ui' },
          { text: 'Annotations & evals', link: '/cookbook/annotations' },
          { text: 'Files, images & PDFs', link: '/cookbook/files-and-images' },
          { text: 'MCP servers', link: '/cookbook/mcp-servers' },
          { text: 'Provider tools', link: '/cookbook/provider-tools' },
          { text: 'Web search', link: '/cookbook/web-search' },
          { text: 'Reasoning models', link: '/cookbook/reasoning' },
          { text: 'Interrupting & cancelling', link: '/cookbook/cancellation' },
          { text: 'Subagents & parallelism', link: '/cookbook/subagents' },
        ],
      },
      {
        text: 'Meta',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'Upgrading', link: '/upgrading' },
          { text: 'Glossary', link: '/glossary' },
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
