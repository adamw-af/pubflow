import { memo, useMemo } from "react";
import * as React from "react";

import { Link, useLocation } from "react-router";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";

export const NavMain = memo(({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: React.ElementType;
  }[];
}) => {
  const location = useLocation();

  const navItems = useMemo(() => 
    items.map((item) => ({
      ...item,
      isActive: location.pathname === item.url,
    })), 
    [items, location.pathname]
  );

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={item.isActive}
                render={<Link to={item.url} prefetch="intent" />}
              >
                {item.icon && <item.icon />}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
});
