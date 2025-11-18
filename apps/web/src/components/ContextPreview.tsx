import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockItem,
} from '@/components/ui/shadcn-io/code-block'

export function ContextPreview({ data }: { data: any[] }) {
  return (
    <div className="h-full overflow-y-auto">
      <CodeBlock
        data={[{
          language: 'json',
          filename: 'context.json',
          code: JSON.stringify(data, null, 2)
        }]}
        defaultValue="json"
        className="h-full overflow-auto no-scrollbar"
      >
        <CodeBlockHeader>
          <CodeBlockFilename>context.json</CodeBlockFilename>
          <CodeBlockCopyButton />
        </CodeBlockHeader>
        <CodeBlockBody className=''>
          {(item) => (
            <CodeBlockItem
              key={item.language}
              value={item.language}
              className="[&_pre]:whitespace-pre-wrap [&_code]:whitespace-pre-wrap"
            >
              <CodeBlockContent language="json">
                {item.code}
              </CodeBlockContent>
            </CodeBlockItem>
          )}
        </CodeBlockBody>
      </CodeBlock>
    </div>
  )
}

// Default export for lazy loading
export default ContextPreview
