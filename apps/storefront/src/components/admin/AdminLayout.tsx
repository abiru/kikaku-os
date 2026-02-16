'use client'

import { useState, useEffect } from 'react'
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
  UserGroupIcon,
  StarIcon,
  ChatBubbleLeftRightIcon,
  NewspaperIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'
import { t } from '../../i18n'
import { SidebarLayout } from '../catalyst/sidebar-layout'
import {
  Sidebar,
  SidebarHeader,
  SidebarBody,
  SidebarFooter,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '../catalyst/sidebar'
import { Dropdown, DropdownButton, DropdownMenu, DropdownItem } from '../catalyst/dropdown'
import { Avatar } from '../catalyst/avatar'
import { Navbar, NavbarItem } from '../catalyst/navbar'
import { Badge } from '../catalyst/badge'

type UserInfo = {
  email: string | null
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
}

type RbacUserInfo = {
  role: string
  permissions: string[]
}

type NavigationItem = {
  name: string
  href: string
  icon: React.ForwardRefExoticComponent<React.SVGProps<SVGSVGElement>>
  permission?: string // Required permission to view this nav item
}

// Navigation items with their required permissions
const navigation: NavigationItem[] = [
  { name: 'admin.dashboard', href: '/admin/', icon: HomeIcon, permission: 'dashboard:read' },
  { name: 'admin.inbox', href: '/admin/inbox', icon: InboxIcon, permission: 'inbox:read' },
  { name: 'admin.orders', href: '/admin/orders', icon: ShoppingCartIcon, permission: 'orders:read' },
  { name: 'admin.customers', href: '/admin/customers', icon: UsersIcon, permission: 'customers:read' },
  { name: 'admin.shipping', href: '/admin/shipping', icon: TruckIcon, permission: 'orders:read' },
  { name: 'admin.events', href: '/admin/events', icon: CalendarIcon, permission: 'orders:read' },
  { name: 'admin.products', href: '/admin/products', icon: CubeIcon, permission: 'products:read' },
  { name: 'admin.homeHeroes', href: '/admin/home-heroes', icon: PhotoIcon, permission: 'products:write' },
  { name: 'admin.bulkImageUpload', href: '/admin/bulk-image-upload', icon: PhotoIcon, permission: 'products:write' },
  { name: 'admin.categories', href: '/admin/categories', icon: FolderIcon, permission: 'products:read' },
  { name: 'admin.coupons', href: '/admin/coupons', icon: TicketIcon, permission: 'products:write' },
  { name: 'admin.reviews', href: '/admin/reviews', icon: StarIcon, permission: 'products:read' },
  { name: 'admin.inventory', href: '/admin/inventory', icon: ArchiveBoxIcon, permission: 'inventory:read' },
  { name: 'admin.inquiries', href: '/admin/inquiries', icon: ChatBubbleLeftRightIcon, permission: 'inbox:read' },
  { name: 'admin.pages', href: '/admin/pages', icon: DocumentDuplicateIcon, permission: 'settings:write' },
  { name: 'admin.emailTemplates', href: '/admin/email-templates', icon: EnvelopeIcon, permission: 'settings:write' },
  { name: 'admin.newsletter', href: '/admin/newsletter', icon: NewspaperIcon, permission: 'customers:read' },
  { name: 'admin.googleAds', href: '/admin/ads', icon: MegaphoneIcon, permission: 'settings:write' },
  { name: 'admin.reports', href: '/admin/reports', icon: ChartBarIcon, permission: 'reports:read' },
  { name: 'admin.ledger', href: '/admin/ledger', icon: DocumentTextIcon, permission: 'ledger:read' },
  { name: 'admin.users', href: '/admin/users', icon: UserGroupIcon, permission: 'users:read' },
  { name: 'admin.auditLogs', href: '/admin/audit-logs', icon: ClipboardDocumentListIcon, permission: 'settings:read' },
]

// Settings requires settings:read permission
const settingsPermission = 'settings:read'

const getInitials = (user: UserInfo | null): string => {
  if (!user) return 'A'
  if (user.firstName) {
    return user.firstName.charAt(0).toUpperCase()
  }
  if (user.email) {
    return user.email.charAt(0).toUpperCase()
  }
  return 'A'
}

const getDisplayName = (user: UserInfo | null): string => {
  if (!user) return 'Admin'
  if (user.firstName) {
    return user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName
  }
  return user.email || 'Admin'
}

// Custom hook to fetch Clerk user info for display purposes only
// Authentication is handled by middleware - if this component renders, user is authenticated
function useClerkUser() {
  const [user, setUser] = useState<UserInfo | null>(null)

  useEffect(() => {
    let mounted = true

    // Single attempt to fetch user info - no polling, no loading state
    // If Clerk is available, great. If not, we show placeholder until it loads
    const fetchUserInfo = () => {
      const clerk = (
        window as {
          Clerk?: {
            user?: {
              primaryEmailAddress?: { emailAddress: string }
              firstName: string | null
              lastName: string | null
              imageUrl: string
            } | null
          }
        }
      ).Clerk

      if (clerk?.user && mounted) {
        setUser({
          email: clerk.user.primaryEmailAddress?.emailAddress || null,
          firstName: clerk.user.firstName,
          lastName: clerk.user.lastName,
          imageUrl: clerk.user.imageUrl,
        })
      }
    }

    // Try immediately
    fetchUserInfo()

    // If Clerk hasn't loaded yet, try again after a short delay
    const timer = setTimeout(fetchUserInfo, 500)

    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [])

  const signOut = async () => {
    const clerk = (window as { Clerk?: { signOut?: () => Promise<void> } }).Clerk
    if (clerk?.signOut) {
      await clerk.signOut()
    }
    window.location.href = '/admin/login'
  }

  return { user, signOut }
}

type Props = {
  currentPath: string
  children: React.ReactNode
  rbacUser?: RbacUserInfo | null // RBAC info from server
  lowStockCount?: number
}

export default function AdminLayout({ currentPath, children, rbacUser, lowStockCount = 0 }: Props) {
  // Authentication is already handled by middleware (src/middleware.ts)
  // If this component is rendering, the user is authenticated
  // We only fetch user info for display purposes (avatar, name)
  const { user, signOut } = useClerkUser()

  // Filter navigation based on permissions
  const hasPermission = (permission: string | undefined): boolean => {
    // If no permission required, show the item
    if (!permission) return true
    // If no RBAC info, show all (fallback for backward compatibility)
    if (!rbacUser) return true
    // Check if user has the required permission
    return rbacUser.permissions.includes(permission)
  }

  const filteredNavigation = navigation.filter((item) => hasPermission(item.permission))
  const canViewSettings = hasPermission(settingsPermission)

  const isActive = (href: string) => {
    if (href === '/admin/') {
      return currentPath === '/admin/' || currentPath === '/admin'
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
          {rbacUser && (
            <div className="ml-auto flex items-center gap-2">
              <Badge color="zinc" className="capitalize">
                {rbacUser.role}
              </Badge>
            </div>
          )}
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
              {filteredNavigation.map((item) => {
                const Icon = item.icon
                const isCurrent = isActive(item.href)
                const showBadge = item.href === '/admin/inventory' && lowStockCount > 0
                return (
                  <SidebarItem key={item.name} href={item.href} current={isCurrent}>
                    <Icon data-slot="icon" />
                    <SidebarLabel>{t(item.name)}</SidebarLabel>
                    {showBadge && (
                      <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {lowStockCount}
                      </span>
                    )}
                  </SidebarItem>
                )
              })}
            </SidebarSection>

            <SidebarSpacer />

            {canViewSettings && (
              <SidebarSection>
                <SidebarItem href="/admin/settings" current={currentPath === '/admin/settings'}>
                  <Cog6ToothIcon data-slot="icon" />
                  <SidebarLabel>{t('admin.settings')}</SidebarLabel>
                </SidebarItem>
              </SidebarSection>
            )}
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
                <DropdownItem href="/">{t('admin.viewStore')}</DropdownItem>
                <DropdownItem
                  onClick={(e) => {
                    e.preventDefault()
                    signOut()
                  }}
                >
                  {t('admin.signOut')}
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
