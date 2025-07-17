# Chakra UI to shadcn/ui Component Mapping

## Direct 1:1 Mappings

| Chakra UI | shadcn/ui | Status |
|-----------|-----------|--------|
| `Button` | `Button` | ✅ Available |
| `Card` + `CardBody` | `Card` + `CardContent` | ✅ Available |
| `Input` | `Input` | ✅ Available |
| `Textarea` | `Textarea` | ✅ Available |
| `FormControl` + `FormLabel` | `Label` | ✅ Available |
| `Modal` + `ModalOverlay` + `ModalContent` + `ModalHeader` + `ModalBody` + `ModalFooter` + `ModalCloseButton` | `Dialog` + `DialogContent` + `DialogHeader` + `DialogDescription` + `DialogFooter` + `DialogClose` | ✅ Available |
| `Table` + `Thead` + `Tbody` + `Tr` + `Th` + `Td` | `Table` + `TableHead` + `TableBody` + `TableRow` + `TableCell` | ✅ Available |
| `Select` | `Select` | ✅ Available |
| `Badge` | `Badge` | ✅ Available |
| `Switch` | `Switch` | ✅ Available |
| `Tabs` + `TabList` + `Tab` + `TabPanels` + `TabPanel` | `Tabs` + `TabsList` + `TabsTrigger` + `TabsContent` | ✅ Available |

## Components needing Tailwind CSS classes

| Chakra UI | shadcn/ui Equivalent | Implementation |
|-----------|---------------------|----------------|
| `Box` | `div` | Use `<div>` with Tailwind classes |
| `Flex` | `div` | Use `<div className="flex">` |
| `Text` | `p` or `span` | Use `<p>` or `<span>` with Tailwind |
| `VStack` | `div` | Use `<div className="flex flex-col space-y-4">` |
| `HStack` | `div` | Use `<div className="flex space-x-4">` |
| `Divider` | `hr` | Use `<hr className="border-border">` |
| `Grid` + `GridItem` | `div` | Use `<div className="grid">` |
| `Image` | `img` | Use `<img>` with Tailwind |
| `Spinner` | Custom | Use lucide-react `Loader2` with `animate-spin` |
| `Container` | `div` | Use `<div className="container mx-auto">` |
| `Heading` | `h1`, `h2`, etc. | Use HTML headings with Tailwind |

## Components needing custom implementation

| Chakra UI | Implementation Strategy |
|-----------|------------------------|
| `IconButton` | Extend `Button` with icon props |
| `Menu` + `MenuButton` + `MenuList` + `MenuItem` + `MenuDivider` | Need to install `dropdown-menu` component |
| `Tooltip` | Need to install `tooltip` component |
| `Stat` + `StatLabel` + `StatNumber` + `StatHelpText` | Custom implementation with Tailwind |
| `useToast` | Need to install `toast` component |
| `useDisclosure` | Custom React hook for modal states |

## Installation Commands for Missing Components

```bash
npx shadcn@latest add dropdown-menu tooltip toast
```

## Hook Replacements

| Chakra UI Hook | Replacement |
|----------------|-------------|
| `useToast` | shadcn/ui `useToast` |
| `useDisclosure` | Custom hook: `const [isOpen, setIsOpen] = useState(false)` |

## Styling Approach

- All layout components (`Box`, `Flex`, `VStack`, `HStack`) become `div` elements with Tailwind classes
- Maintain exact same spacing, colors, and layout using Tailwind utilities
- Use existing CSS custom properties for consistent theming
- Preserve all existing functionality and interactions