import { useTranslation } from 'react-i18next';
import { useListProviders } from '@refly-packages/ai-workspace-common/queries';
import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';
import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { ProviderIcon } from '@lobehub/icons';
import { Spin } from '@refly-packages/ai-workspace-common/components/common/spin';
import {
  Button,
  Input,
  Empty,
  Switch,
  Tooltip,
  Dropdown,
  DropdownProps,
  Popconfirm,
  MenuProps,
  message,
  Tag,
} from 'antd';
import { LuGlobe, LuPlus, LuSearch, LuList, LuStore } from 'react-icons/lu';
import { cn } from '@refly-packages/ai-workspace-common/utils/cn';
import { Provider } from '@refly-packages/ai-workspace-common/requests/types.gen';
import {
  IconDelete,
  IconEdit,
  IconMoreHorizontal,
} from '@refly-packages/ai-workspace-common/components/common/icon';
import { ProviderModal } from './provider-modal';
import { ProviderStore } from './ProviderStore';

const ActionDropdown = ({
  provider,
  handleEdit,
  refetch,
}: { provider: Provider; handleEdit: () => void; refetch: () => void }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  const handleDelete = useCallback(
    async (provider: Provider) => {
      try {
        const res = await getClient().deleteProvider({
          body: { providerId: provider.providerId },
        });
        if (res.data.success) {
          refetch();
          message.success(t('common.deleteSuccess'));
        }
      } catch (error) {
        console.error('Failed to delete provider', error);
      }
    },
    [refetch],
  );

  const items: MenuProps['items'] = [
    {
      label: (
        <div className="flex items-center flex-grow">
          <IconEdit size={16} className="mr-2" />
          {t('common.edit')}
        </div>
      ),
      key: 'edit',
      onClick: () => handleEdit(),
    },
    {
      label: (
        <Popconfirm
          placement="bottomLeft"
          title={t('settings.modelProviders.deleteConfirm', {
            name: provider.name || t('common.untitled'),
          })}
          onConfirm={() => handleDelete(provider)}
          onCancel={() => setVisible(false)}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
          overlayStyle={{ maxWidth: '300px' }}
        >
          <div
            className="flex items-center text-red-600 flex-grow"
            onClick={(e) => e.stopPropagation()}
          >
            <IconDelete size={16} className="mr-2" />
            {t('common.delete')}
          </div>
        </Popconfirm>
      ),
      key: 'delete',
    },
  ];

  const handleOpenChange: DropdownProps['onOpenChange'] = (open: boolean, info: any) => {
    if (info.source === 'trigger') {
      setVisible(open);
    }
  };

  return (
    <Dropdown trigger={['click']} open={visible} onOpenChange={handleOpenChange} menu={{ items }}>
      <Button type="text" icon={<IconMoreHorizontal />} />
    </Dropdown>
  );
};

const ProviderItem = React.memo(
  ({
    provider,
    onSettingsClick,
    onToggleEnabled,
    isSubmitting,
    refetch,
  }: {
    provider: Provider;
    onSettingsClick: (provider: Provider) => void;
    onToggleEnabled: (provider: Provider, enabled: boolean) => void;
    isSubmitting: boolean;
    refetch: () => void;
  }) => {
    const { t } = useTranslation();
    const handleToggleChange = useCallback(
      (checked: boolean) => {
        onToggleEnabled(provider, checked);
      },
      [provider, onToggleEnabled],
    );

    const handleSwitchWrapperClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
    }, []);

    return (
      <div className="mb-3 p-4 rounded-md cursor-pointer border border-solid border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex-1 flex items-center">
            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center mr-3 dark:bg-gray-800">
              {provider.isGlobal ? (
                <LuGlobe size={18} />
              ) : (
                <ProviderIcon provider={provider.name?.toLowerCase()} size={18} type={'color'} />
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="font-medium flex items-center gap-2">
                <span>{provider.name}</span>
                <span className="text-sm text-gray-400">{provider.providerKey.toUpperCase()}</span>
              </div>
              {provider.categories?.length > 0 && (
                <div>
                  {provider.categories.map((category) => (
                    <Tag key={category} color="green" bordered={false}>
                      {category}
                    </Tag>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!provider.isGlobal && (
              <ActionDropdown
                provider={provider}
                handleEdit={() => onSettingsClick({ ...provider, apiKey: 'default' })}
                refetch={refetch}
              />
            )}

            <Tooltip
              title={
                provider.isGlobal
                  ? ''
                  : provider.enabled
                    ? t('settings.modelProviders.disable')
                    : t('settings.modelProviders.enable')
              }
            >
              <div onClick={handleSwitchWrapperClick} className="flex items-center">
                <Switch
                  size="small"
                  checked={provider.enabled ?? false}
                  onChange={handleToggleChange}
                  loading={isSubmitting}
                  disabled={provider.isGlobal}
                />
              </div>
            </Tooltip>
          </div>
        </div>
      </div>
    );
  },
);

ProviderItem.displayName = 'ProviderItem';

// My Providers Tab Component
const MyProviders: React.FC<{ visible: boolean; onRefetch: () => void }> = ({
  visible,
  onRefetch,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editProvider, setEditProvider] = useState<Provider | null>(null);

  const { data, isLoading, refetch } = useListProviders();

  const handleSettingsClick = useCallback((provider: Provider) => {
    setEditProvider(provider);
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggleEnabled = useCallback(
    async (provider: Provider, enabled: boolean) => {
      setIsSubmitting(true);
      try {
        const res = await getClient().updateProvider({
          body: {
            ...provider,
            enabled,
          },
        });
        if (res.data.success) {
          refetch();
          onRefetch(); // Notify parent to refresh
        }
      } catch (error) {
        console.error('Failed to update provider status', error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [refetch, onRefetch],
  );

  const filteredProviders = useMemo(() => {
    if (!data?.data) return [];

    if (!searchQuery.trim()) return data.data;

    const lowerQuery = searchQuery.toLowerCase();
    return data.data.filter(
      (provider) =>
        provider.name?.toLowerCase().includes(lowerQuery) ||
        provider.providerKey?.toLowerCase().includes(lowerQuery),
    );
  }, [data?.data, searchQuery]);

  useEffect(() => {
    if (visible) {
      refetch();
    }
  }, [visible, refetch]);

  return (
    <div className="h-full overflow-hidden flex flex-col">
      {/* Search and Add Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative flex-1 max-w-xs">
          <Input
            prefix={<LuSearch className="h-4 w-4 text-gray-400" />}
            placeholder={t('settings.modelProviders.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Button
          type="primary"
          icon={<LuPlus className="h-5 w-5 flex items-center" />}
          onClick={() => setIsAddDialogOpen(true)}
        >
          {t('settings.modelProviders.addProvider')}
        </Button>
      </div>

      {/* Providers List */}
      <div
        className={cn(
          'flex-1 overflow-auto',
          isLoading || filteredProviders.length === 0 ? 'flex items-center justify-center' : '',
          filteredProviders.length === 0
            ? 'border-dashed border-gray-200 dark:border-gray-600 rounded-md'
            : '',
        )}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-[300px]">
            <Spin />
          </div>
        ) : filteredProviders.length === 0 ? (
          <Empty
            description={
              searchQuery ? (
                <>
                  <p>{t('settings.modelProviders.noSearchResults')}</p>
                  <p className="text-sm text-gray-400">
                    {t('settings.modelProviders.tryDifferentSearch')}
                  </p>
                </>
              ) : (
                <p>{t('settings.modelProviders.noProviders')}</p>
              )
            }
          >
            {!searchQuery && (
              <Button
                onClick={() => setIsAddDialogOpen(true)}
                icon={<LuPlus className="flex items-center" />}
              >
                {t('settings.modelProviders.addFirstProvider')}
              </Button>
            )}
          </Empty>
        ) : (
          <div>
            <div>
              {filteredProviders?.map((provider) => (
                <ProviderItem
                  key={provider.providerId}
                  provider={provider}
                  refetch={refetch}
                  onSettingsClick={handleSettingsClick}
                  onToggleEnabled={handleToggleEnabled}
                  isSubmitting={isSubmitting}
                />
              ))}
            </div>
            <div className="text-center text-gray-400 text-sm mt-4 pb-10">{t('common.noMore')}</div>
          </div>
        )}
      </div>

      {/* Combined Modal for Create and Edit */}
      <ProviderModal
        isOpen={isAddDialogOpen || !!editProvider}
        onClose={() => {
          setIsAddDialogOpen(false);
          setEditProvider(null);
        }}
        provider={editProvider}
        onSuccess={() => {
          refetch();
          onRefetch();
        }}
      />
    </div>
  );
};

interface ModelProvidersProps {
  visible: boolean;
}

export const ModelProviders = ({ visible }: ModelProvidersProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('my-providers');

  // Get installed providers for Provider Store
  const { data: providersData, refetch: refetchProviders } = useListProviders();
  const installedProviders = providersData?.data || [];

  const handleInstallSuccess = useCallback(() => {
    refetchProviders();
  }, [refetchProviders]);

  const handleRefetch = useCallback(() => {
    refetchProviders();
  }, [refetchProviders]);

  useEffect(() => {
    if (visible) {
      refetchProviders();
    }
  }, [visible, refetchProviders]);

  const tabItems = [
    {
      key: 'my-providers',
      label: t('settings.modelProviders.myProviders'),
      icon: <LuList className="h-4 w-4 flex items-center" />,
    },
    {
      key: 'provider-store',
      label: t('settings.modelProviders.providerStore'),
      icon: <LuStore className="h-4 w-4 flex items-center" />,
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'my-providers':
        return (
          <MyProviders
            visible={visible && activeTab === 'my-providers'}
            onRefetch={handleRefetch}
          />
        );
      case 'provider-store':
        return (
          <ProviderStore
            visible={visible && activeTab === 'provider-store'}
            installedProviders={installedProviders}
            onInstallSuccess={handleInstallSuccess}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-4 pt-0 h-full overflow-hidden flex flex-col">
      {/* Custom Tab Header */}
      <div className="flex border-b border-gray-100 dark:border-gray-800">
        {tabItems.map((tab) => (
          <div
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              cursor-pointer relative px-4 py-2.5 flex items-center justify-center gap-1.5 text-sm font-medium transition-all duration-200 ease-in-out 
              ${
                activeTab === tab.key
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }
            `}
          >
            <div className="text-sm">{tab.icon}</div>
            <div>{tab.label}</div>
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600 dark:bg-green-400 rounded-t-sm" />
            )}
          </div>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden mt-4">{renderTabContent()}</div>
    </div>
  );
};
