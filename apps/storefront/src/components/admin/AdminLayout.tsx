'use client'

import { useState, useEffect } from'react'
import {
 HomeIcon,
 InboxIcon,
 ShoppingCartIcon,
 UsersIcon,
 TruckIcon,
 CalendarIcon,
 CubeIcon,
 ArchiveBoxIcon,
 ChartBarIcon,
 DocumentTextIcon,
 DocumentDuplicateIcon,
 Cog6ToothIcon,
 FolderIcon,
 TicketIcon,
 EnvelopeIcon,
 MegaphoneIcon,
 PhotoIcon,
 ChevronDownIcon,
} from'@heroicons/react/24/outline'
import { SidebarLayout } from'../catalyst/sidebar-layout'
import {
 Sidebar,
 SidebarHeader,
 SidebarBody,
 SidebarFooter,
 SidebarItem,
 SidebarLabel,
 SidebarSection,
 SidebarSpacer,
} from'../catalyst/sidebar'
import { Dropdown, DropdownButton, DropdownMenu, DropdownItem } from'../catalyst/dropdown'
import { Avatar } from'../catalyst/avatar'
import { Navbar, NavbarItem } from'../catalyst/navbar'

type UserInfo = {
 email: string | null
 firstName: string | null
 lastName: string | null
 imageUrl: string | null
}

type NavigationItem = {
 name: string
 href: string
 icon: React.ForwardRefExoticComponent<React.SVGProps<SVGSVGElement>>
}

const navigation: NavigationItem[] = [
 { name:'Dashboard', href:'/admin/', icon: HomeIcon },
 { name:'Inbox', href:'/admin/inbox', icon: InboxIcon },
 { name:'Orders', href:'/admin/orders', icon: ShoppingCartIcon },
 { name:'Customers', href:'/admin/customers', icon: UsersIcon },
 { name:'Shipping', href:'/admin/shipping', icon: TruckIcon },
 { name:'Events', href:'/admin/events', icon: CalendarIcon },
 { name:'Products', href:'/admin/products', icon: CubeIcon },
 { name:'Bulk Image Upload', href:'/admin/bulk-image-upload', icon: PhotoIcon },
 { name:'Categories', href:'/admin/categories', icon: FolderIcon },
 { name:'Coupons', href:'/admin/coupons', icon: TicketIcon },
 { name:'Inventory', href:'/admin/inventory', icon: ArchiveBoxIcon },
 { name:'Pages', href:'/admin/pages', icon: DocumentDuplicateIcon },
 { name:'Email Templates', href:'/admin/email-templates', icon: EnvelopeIcon },
 { name:'Google Ads', href:'/admin/ads', icon: MegaphoneIcon },
 { name:'Reports', href:'/admin/reports', icon: ChartBarIcon },
 { name:'Ledger', href:'/admin/ledger', icon: DocumentTextIcon },
]

const getInitials = (user: UserInfo | null): string => {
 if (!user) return'A'
 if (user.firstName) {
 return user.firstName.charAt(0).toUpperCase()
 }
 if (user.email) {
 return user.email.charAt(0).toUpperCase()
 }
 return'A'
}

const getDisplayName = (user: UserInfo | null): string => {
 if (!user) return'Admin'
 if (user.firstName) {
 return user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName
 }
 return user.email ||'Admin'
}

// Custom hook to access Clerk via window global
function useClerkAuth() {
 const [isLoaded, setIsLoaded] = useState(false)
 const [isSignedIn, setIsSignedIn] = useState(false)
 const [user, setUser] = useState<UserInfo | null>(null)

 useEffect(() => {
 let mounted = true
 let attempts = 0
 const maxAttempts = 100 // 10 seconds max

 const checkClerk = () => {
 const clerk = (
 window as {
 Clerk?: {
 loaded?: boolean
 session?: { id: string } | null
 user?: {
 primaryEmailAddress?: { emailAddress: string }
 firstName: string | null
 lastName: string | null
 imageUrl: string
 } | null
 signOut?: () => Promise<void>
 }
 }
 ).Clerk

 if (clerk?.loaded) {
 if (mounted) {
 setIsLoaded(true)
 setIsSignedIn(!!clerk.session)
 if (clerk.user) {
 setUser({
 email: clerk.user.primaryEmailAddress?.emailAddress || null,
 firstName: clerk.user.firstName,
 lastName: clerk.user.lastName,
 imageUrl: clerk.user.imageUrl,
 })
 }
 }
 return
 }

 attempts++
 if (attempts < maxAttempts) {
 setTimeout(checkClerk, 100)
 } else if (mounted) {
 // Clerk failed to load, but we still mark as loaded to show UI
 setIsLoaded(true)
 setIsSignedIn(false)
 }
 }

 checkClerk()

 return () => {
 mounted = false
 }
 }, [])

 const signOut = async () => {
 const clerk = (window as { Clerk?: { signOut?: () => Promise<void> } }).Clerk
 if (clerk?.signOut) {
 await clerk.signOut()
 }
 window.location.href ='/admin/login'
 }

 return { isLoaded, isSignedIn, user, signOut }
}

type Props = {
 currentPath: string
 children: React.ReactNode
}

export default function AdminLayout({ currentPath, children }: Props) {
 const { isLoaded, isSignedIn, user, signOut } = useClerkAuth()

 useEffect(() => {
 // Redirect to login if not authenticated (after auth is loaded)
 if (isLoaded && !isSignedIn) {
 window.location.href ='/admin/login'
 }
 }, [isLoaded, isSignedIn])

 if (!isLoaded) {
 return (
 <div className="flex min-h-screen items-center justify-center bg-zinc-50">
 <div className="flex flex-col items-center gap-3">
 <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
 <span className="text-sm text-zinc-500">Authenticating...</span>
 </div>
 </div>
 )
 }

 const isActive = (href: string) => {
 if (href ==='/admin/') {
 return currentPath ==='/admin/' || currentPath ==='/admin'
 }
 return currentPath.startsWith(href)
 }

 return (
 <SidebarLayout
 navbar={
 <Navbar>
 <NavbarItem href="/admin/" className="max-lg:hidden">
 <span className="text-lg font-semibold text-zinc-950">Led Kikaku OS</span>
 </NavbarItem>
 </Navbar>
 }
 sidebar={
 <Sidebar>
 <SidebarHeader>
 <a href="/admin/" className="flex items-center gap-2 px-2 py-2">
 <span className="text-lg font-semibold text-zinc-950">Led Kikaku OS</span>
 </a>
 </SidebarHeader>

 <SidebarBody>
 <SidebarSection>
 {navigation.map((item) => {
 const Icon = item.icon
 const isCurrent = isActive(item.href)
 return (
 <SidebarItem key={item.name} href={item.href} current={isCurrent}>
 <Icon data-slot="icon" />
 <SidebarLabel>{item.name}</SidebarLabel>
 </SidebarItem>
 )
 })}
 </SidebarSection>

 <SidebarSpacer />

 <SidebarSection>
 <SidebarItem href="/admin/settings" current={currentPath ==='/admin/settings'}>
 <Cog6ToothIcon data-slot="icon" />
 <SidebarLabel>Settings</SidebarLabel>
 </SidebarItem>
 </SidebarSection>
 </SidebarBody>

 <SidebarFooter>
 <Dropdown>
 <DropdownButton as={SidebarItem}>
 <Avatar src={user?.imageUrl} initials={getInitials(user)} className="size-8" />
 <SidebarLabel className="flex items-center gap-2">
 {getDisplayName(user)}
 <ChevronDownIcon className="size-4 text-zinc-500" />
 </SidebarLabel>
 </DropdownButton>
 <DropdownMenu anchor="top start">
 <DropdownItem href="/">View Store</DropdownItem>
 <DropdownItem
 onClick={(e) => {
 e.preventDefault()
 signOut()
 }}
 >
 Sign out
 </DropdownItem>
 </DropdownMenu>
 </Dropdown>
 </SidebarFooter>
 </Sidebar>
 }
 >
 {children}
 </SidebarLayout>
 )
}
