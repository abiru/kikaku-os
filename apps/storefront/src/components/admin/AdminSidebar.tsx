import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  TransitionChild,
} from '@headlessui/react'
import {
  Bars3Icon,
  XMarkIcon,
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
} from '@heroicons/react/24/outline'
import { ChevronDownIcon } from '@heroicons/react/20/solid'

type UserInfo = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
};

type NavigationItem = {
  name: string
  href: string
  icon: React.ForwardRefExoticComponent<React.SVGProps<SVGSVGElement>>
}

const navigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/admin/', icon: HomeIcon },
  { name: 'Inbox', href: '/admin/inbox', icon: InboxIcon },
  { name: 'Orders', href: '/admin/orders', icon: ShoppingCartIcon },
  { name: 'Customers', href: '/admin/customers', icon: UsersIcon },
  { name: 'Shipping', href: '/admin/shipping', icon: TruckIcon },
  { name: 'Events', href: '/admin/events', icon: CalendarIcon },
  { name: 'Products', href: '/admin/products', icon: CubeIcon },
  { name: 'Bulk Image Upload', href: '/admin/bulk-image-upload', icon: PhotoIcon },
  { name: 'Categories', href: '/admin/categories', icon: FolderIcon },
  { name: 'Coupons', href: '/admin/coupons', icon: TicketIcon },
  { name: 'Inventory', href: '/admin/inventory', icon: ArchiveBoxIcon },
  { name: 'Pages', href: '/admin/pages', icon: DocumentDuplicateIcon },
  { name: 'Email Templates', href: '/admin/email-templates', icon: EnvelopeIcon },
  { name: 'Google Ads', href: '/admin/ads', icon: MegaphoneIcon },
  { name: 'Reports', href: '/admin/reports', icon: ChartBarIcon },
  { name: 'Ledger', href: '/admin/ledger', icon: DocumentTextIcon },
]

const getInitials = (user: UserInfo | null): string => {
  if (!user) return 'A';
  if (user.firstName) {
    return user.firstName.charAt(0).toUpperCase();
  }
  if (user.email) {
    return user.email.charAt(0).toUpperCase();
  }
  return 'A';
};

const getDisplayName = (user: UserInfo | null): string => {
  if (!user) return 'Admin';
  if (user.firstName) {
    return user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName;
  }
  return user.email || 'Admin';
};

function classNames(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

// Custom hook to access Clerk via window global
function useClerkAuth() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    let mounted = true;
    let attempts = 0;
    const maxAttempts = 100; // 10 seconds max

    const checkClerk = () => {
      const clerk = (window as { Clerk?: {
        loaded?: boolean;
        session?: { id: string } | null;
        user?: {
          primaryEmailAddress?: { emailAddress: string };
          firstName: string | null;
          lastName: string | null;
          imageUrl: string;
        } | null;
        signOut?: () => Promise<void>;
      } }).Clerk;

      if (clerk?.loaded) {
        if (mounted) {
          setIsLoaded(true);
          setIsSignedIn(!!clerk.session);
          if (clerk.user) {
            setUser({
              email: clerk.user.primaryEmailAddress?.emailAddress || null,
              firstName: clerk.user.firstName,
              lastName: clerk.user.lastName,
              imageUrl: clerk.user.imageUrl,
            });
          }
        }
        return;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkClerk, 100);
      } else if (mounted) {
        // Clerk failed to load, but we still mark as loaded to show UI
        setIsLoaded(true);
        setIsSignedIn(false);
      }
    };

    checkClerk();

    return () => {
      mounted = false;
    };
  }, []);

  const signOut = async () => {
    const clerk = (window as { Clerk?: { signOut?: () => Promise<void> } }).Clerk;
    if (clerk?.signOut) {
      await clerk.signOut();
    }
    window.location.href = '/admin/login';
  };

  return { isLoaded, isSignedIn, user, signOut };
}

type Props = {
  currentPath: string
  children: React.ReactNode
}

function NavList({ isActive }: { isActive: (href: string) => boolean }) {
  return (
    <ul role="list" className="-mx-2 space-y-1">
      {navigation.map((item) => (
        <li key={item.name}>
          <a
            href={item.href}
            className={classNames(
              isActive(item.href)
                ? 'border-l-2 border-emerald-500 bg-zinc-50 text-zinc-900 pl-[calc(0.5rem-2px)]'
                : 'text-zinc-600 hover:bg-zinc-900/5 hover:text-zinc-900',
              'group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6',
            )}
          >
            <item.icon
              aria-hidden="true"
              className={classNames(
                isActive(item.href) ? 'text-emerald-500' : 'text-zinc-400 group-hover:text-zinc-600',
                'size-6 shrink-0',
              )}
            />
            {item.name}
          </a>
        </li>
      ))}
    </ul>
  )
}

function SettingsLink({ isActive }: { isActive: boolean }) {
  return (
    <a
      href="/admin/settings"
      className={classNames(
        isActive
          ? 'border-l-2 border-emerald-500 bg-zinc-50 text-zinc-900 pl-[calc(0.5rem-2px)]'
          : 'text-zinc-600 hover:bg-zinc-900/5 hover:text-zinc-900',
        'group -mx-2 flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6',
      )}
    >
      <Cog6ToothIcon
        aria-hidden="true"
        className={classNames(
          isActive ? 'text-emerald-500' : 'text-zinc-400 group-hover:text-zinc-600',
          'size-6 shrink-0',
        )}
      />
      Settings
    </a>
  )
}

export default function AdminSidebar({ currentPath, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isLoaded, isSignedIn, user, signOut } = useClerkAuth()

  useEffect(() => {
    // Redirect to login if not authenticated (after auth is loaded)
    if (isLoaded && !isSignedIn) {
      window.location.href = '/admin/login';
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-emerald-500" />
          <span className="text-sm text-zinc-500">Authenticating...</span>
        </div>
      </div>
    );
  }

  const isActive = (href: string) => {
    if (href === '/admin/') {
      return currentPath === '/admin/' || currentPath === '/admin'
    }
    return currentPath.startsWith(href)
  }

  const isSettingsActive = currentPath.startsWith('/admin/settings')

  return (
    <>
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-zinc-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0"
        />

        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                <button type="button" onClick={() => setSidebarOpen(false)} className="-m-2.5 p-2.5">
                  <span className="sr-only">Close sidebar</span>
                  <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                </button>
              </div>
            </TransitionChild>

            <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4">
              <div className="flex h-16 shrink-0 items-center">
                <a href="/admin/" className="text-lg font-semibold text-zinc-900">
                  Led Kikaku OS
                </a>
              </div>
              <nav className="flex flex-1 flex-col">
                <ul role="list" className="flex flex-1 flex-col gap-y-7">
                  <li>
                    <NavList isActive={isActive} />
                  </li>
                  <li className="mt-auto">
                    <SettingsLink isActive={isSettingsActive} />
                  </li>
                </ul>
              </nav>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Static sidebar for desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-zinc-900/10 bg-white px-6 pb-4">
          <div className="flex h-16 shrink-0 items-center">
            <a href="/admin/" className="text-lg font-semibold text-zinc-900">
              Led Kikaku OS
            </a>
          </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <NavList isActive={isActive} />
              </li>
              <li className="mt-auto">
                <SettingsLink isActive={isSettingsActive} />
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <div className="lg:pl-72">
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-zinc-900/10 bg-white px-4 sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-m-2.5 p-2.5 text-zinc-700 lg:hidden"
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>

          {/* Separator */}
          <div aria-hidden="true" className="h-6 w-px bg-zinc-900/10 lg:hidden" />

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1" />
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              {/* Profile dropdown */}
              <Menu as="div" className="relative">
                <MenuButton className="-m-1.5 flex items-center p-1.5">
                  <span className="sr-only">Open user menu</span>
                  {user?.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt=""
                      className="size-8 rounded-full"
                    />
                  ) : (
                    <span className="inline-flex size-8 items-center justify-center rounded-full bg-zinc-600">
                      <span className="text-sm font-medium text-white">{getInitials(user)}</span>
                    </span>
                  )}
                  <span className="hidden lg:flex lg:items-center">
                    <span aria-hidden="true" className="ml-4 text-sm font-semibold leading-6 text-zinc-900">
                      {getDisplayName(user)}
                    </span>
                    <ChevronDownIcon aria-hidden="true" className="ml-2 size-5 text-zinc-400" />
                  </span>
                </MenuButton>
                <MenuItems
                  transition
                  className="absolute right-0 z-10 mt-2.5 w-32 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-zinc-900/5 transition focus:outline-none data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                >
                  <MenuItem>
                    <a
                      href="/"
                      className="block px-3 py-1 text-sm leading-6 text-zinc-900 data-focus:bg-zinc-50"
                    >
                      View Store
                    </a>
                  </MenuItem>
                  <MenuItem>
                    <button
                      type="button"
                      onClick={signOut}
                      className="block w-full text-left px-3 py-1 text-sm leading-6 text-zinc-900 data-focus:bg-zinc-50"
                    >
                      Sign out
                    </button>
                  </MenuItem>
                </MenuItems>
              </Menu>
            </div>
          </div>
        </div>

        <main className="py-10">
          <div className="px-4 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </>
  )
}
