import { useTranslation } from 'react-i18next';
import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';
import { useState, useMemo, useCallback, useEffect, memo } from 'react';
import {
  Button,
  Input,
  Empty,
  Switch,
  Tooltip,
  Dropdown,
  Popconfirm,
  message,
  MenuProps,
  Divider,
  Tag,
  Modal,
  Collapse,
} from 'antd';
import { Spin } from '@refly-packages/ai-workspace-common/components/common/spin';
import { LuPlus, LuSearch, LuMessageCircle, LuImage, LuSettings } from 'react-icons/lu';
import { cn } from '@refly-packages/ai-workspace-common/utils/cn';
import {
  IconDelete,
  IconEdit,
  IconMoreHorizontal,
} from '@refly-packages/ai-workspace-common/components/common/icon';
import { LLMModelConfig, ProviderCategory, ProviderItem } from '@refly/openapi-schema';
import { ModelIcon } from '@lobehub/icons';
import { modelEmitter } from '@refly-packages/ai-workspace-common/utils/event-emitter/model';
import { useGroupModels } from '@refly-packages/ai-workspace-common/hooks/use-group-models';
import { ModelFormModal } from './model-form';
import { useUserStoreShallow } from '@refly-packages/ai-workspace-common/stores/user';
import { useChatStoreShallow } from '@refly-packages/ai-workspace-common/stores/chat';

const MODEL_TIER_TO_COLOR = {
  free: 'green',
  t1: 'blue',
  t2: 'orange',
};

const panelStyle: React.CSSProperties = {
  marginBottom: 12,
  borderRadius: 8,
  border: 'none',
  background: 'rgba(0,0,0, 0.02)',
};

const ActionDropdown = ({
  model,
  handleEdit,
  handleDelete,
}: {
  model: ProviderItem;
  handleEdit: () => void;
  handleDelete: () => void;
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

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
          title={t('settings.modelConfig.deleteConfirm', {
            name: model.name || t('common.untitled'),
          })}
          onConfirm={() => handleDelete()}
          onCancel={() => setVisible(false)}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
          overlayStyle={{ maxWidth: '300px' }}
        >
          <div className="flex items-center text-red-600 flex-grow">
            <IconDelete size={16} className="mr-2" />
            {t('common.delete')}
          </div>
        </Popconfirm>
      ),
      key: 'delete',
    },
  ];

  const handleOpenChange = (open: boolean, info: any) => {
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

const ModelItem = memo(
  ({
    model,
    onEdit,
    onDelete,
    onToggleEnabled,
    isSubmitting,
  }: {
    model: ProviderItem;
    onEdit: (model: ProviderItem) => void;
    onDelete: (model: ProviderItem) => void;
    onToggleEnabled: (model: ProviderItem, enabled: boolean) => void;
    isSubmitting: boolean;
  }) => {
    const { t } = useTranslation();

    const handleToggleChange = useCallback(
      (checked: boolean) => {
        onToggleEnabled(model, checked);
      },
      [model, onToggleEnabled],
    );

    const handleSwitchWrapperClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
    }, []);

    const handleEdit = useCallback(() => {
      onEdit(model);
    }, [model, onEdit]);

    const handleDelete = useCallback(() => {
      onDelete(model);
    }, [model, onDelete]);

    return (
      <div className="bg-white relative mb-3 px-5 py-0.5 rounded-md cursor-pointer border border-solid border-gray-100 group hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 dark:border-gray-700">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex-1 flex items-center gap-2">
            <ModelIcon
              model={(model.config as LLMModelConfig)?.modelId || model.name}
              size={18}
              type={'color'}
            />
            <div className="font-medium">{model.name}</div>

            <Divider type="vertical" />
            <div className="font-normal text-xs text-gray-500">{model.provider?.name}</div>

            {model.tier && (
              <>
                <Divider type="vertical" />
                <Tag color={MODEL_TIER_TO_COLOR[model.tier]}>
                  {t(`settings.modelTier.${model.tier}`)}
                </Tag>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ActionDropdown model={model} handleEdit={handleEdit} handleDelete={handleDelete} />

            <Tooltip
              title={
                model.enabled ? t('settings.modelConfig.disable') : t('settings.modelConfig.enable')
              }
            >
              <div onClick={handleSwitchWrapperClick} className="flex items-center">
                <Switch
                  size="small"
                  checked={model.enabled ?? false}
                  onChange={handleToggleChange}
                  loading={isSubmitting}
                />
              </div>
            </Tooltip>
          </div>
        </div>
      </div>
    );
  },
);

export const ModelConfig = ({ visible }: { visible: boolean }) => {
  const { t } = useTranslation();
  const [category, setCategory] = useState<ProviderCategory>('llm');
  const [modelItems, setModelItems] = useState<ProviderItem[]>([]);
  const [embedding, setEmbedding] = useState<ProviderItem | null>(null);
  const [reranker, setReranker] = useState<ProviderItem | null>(null);
  const [mediaGenerationModels, setMediaGenerationModels] = useState<ProviderItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ProviderItem | null>(null);
  const [activeCollapseKeys, setActiveCollapseKeys] = useState<string[]>([]);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const [activeTab, setActiveTab] = useState('conversation');

  const { userProfile, setUserProfile } = useUserStoreShallow((state) => ({
    userProfile: state.userProfile,
    setUserProfile: state.setUserProfile,
  }));

  const { setMediaModelList } = useChatStoreShallow((state) => ({
    setMediaModelList: state.setMediaModelList,
  }));

  useEffect(() => {
    setMediaModelList(mediaGenerationModels.filter((item) => item.enabled));
  }, [mediaGenerationModels, setMediaModelList]);

  const defaultPreferences = userProfile?.preferences || {};
  const defaultModel = defaultPreferences.defaultModel || {};
  const chatModel = defaultModel.chat;
  const queryAnalysisModel = defaultModel.queryAnalysis;
  const titleGenerationModel = defaultModel.titleGeneration;

  const getDefaultModelTypes = (itemId: string) => {
    const type = [];
    if (itemId === chatModel?.itemId) {
      type.push('chat');
    }
    if (itemId === queryAnalysisModel?.itemId) {
      type.push('queryAnalysis');
    }
    if (itemId === titleGenerationModel?.itemId) {
      type.push('titleGeneration');
    }
    return type;
  };

  const updateDefaultModel = useCallback(
    async (types: ('chat' | 'queryAnalysis' | 'titleGeneration')[], model: ProviderItem | null) => {
      const updatedDefaultModel = {
        ...defaultModel,
      };
      for (const type of types) {
        updatedDefaultModel[type] = model;
      }

      const updatedPreferences = {
        ...defaultPreferences,
        defaultModel: updatedDefaultModel,
      };

      setUserProfile({
        ...userProfile,
        preferences: updatedPreferences,
      });

      const res = await getClient().updateSettings({
        body: {
          preferences: updatedPreferences,
        },
      });

      if (res?.data?.success) {
        message.success(t('settings.defaultModel.syncSuccessfully'));
      }
    },
    [defaultModel, defaultPreferences, setUserProfile, userProfile, t],
  );

  const getProviderItems = useCallback(async () => {
    setIsLoading(true);
    const res = await getClient().listProviderItems();
    setIsLoading(false);
    if (res?.data?.success) {
      const list = res?.data?.data || [];
      setModelItems(list.filter((item) => item.category === 'llm'));
      setEmbedding(list.filter((item) => item.category === 'embedding')?.[0]);
      setReranker(list.filter((item) => item.category === 'reranker')?.[0]);
      setMediaGenerationModels(list.filter((item) => item.category === 'mediaGeneration'));
    }
  }, []);

  const updateModelMutation = async (enabled: boolean, model: ProviderItem) => {
    setIsUpdating(true);
    const res = await getClient().updateProviderItem({
      body: {
        itemId: model.itemId,
        enabled,
      },
    });
    if (res.data.success) {
      const updatedModel = { ...model, enabled };
      if (model.category === 'llm') {
        setModelItems((prev) =>
          prev.map((item) => (item.itemId === model.itemId ? updatedModel : item)),
        );
      } else if (model.category === 'embedding') {
        setEmbedding(updatedModel);
      } else if (model.category === 'reranker') {
        setReranker(updatedModel);
      } else if (model.category === 'mediaGeneration') {
        setMediaGenerationModels((prev) =>
          prev.map((item) => (item.itemId === model.itemId ? updatedModel : item)),
        );
      }

      // Emit event to refresh model list in other components
      modelEmitter.emit('model:list:refetch', null);
    }
    setIsUpdating(false);
  };

  const beforeDeleteProviderItem = async (model: ProviderItem) => {
    const type = getDefaultModelTypes(model.itemId);
    if (type.length) {
      Modal.confirm({
        title: t('settings.modelConfig.deleteSyncConfirm', {
          name: model.name || t('common.untitled'),
        }),
        onOk: () => deleteProviderItem(model.itemId, model.category),
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        okButtonProps: {
          danger: true,
        },
        cancelButtonProps: {
          className: 'hover:!text-green-600 hover:!border-green-600',
        },
      });
    } else {
      deleteProviderItem(model.itemId, model.category);
    }
  };

  const disableDefaultModelConfirm = async (modelName: string, handleOk: () => void) => {
    Modal.confirm({
      title: t('settings.modelConfig.disableDefaultModelTitle'),
      content: t('settings.modelConfig.disableDefaultModelContent', { modelName }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: handleOk,
    });
  };

  const deleteProviderItem = async (itemId: string, category: ProviderCategory) => {
    const res = await getClient().deleteProviderItem({
      body: { itemId },
    });
    if (res.data.success) {
      message.success(t('common.deleteSuccess'));

      if (category === 'mediaGeneration') {
        setMediaGenerationModels(mediaGenerationModels.filter((item) => item.itemId !== itemId));
      } else {
        setModelItems(modelItems.filter((item) => item.itemId !== itemId));
        const types = getDefaultModelTypes(itemId);
        if (types.length) {
          updateDefaultModel(types, null);
        }

        // Emit event to refresh model list in other components
        modelEmitter.emit('model:list:refetch', null);
      }
    }
  };

  const handleAddModel = (category: ProviderCategory) => {
    setCategory(category);
    setEditingModel(null);
    setIsModalOpen(true);
  };

  const handleEditModel = (model: ProviderItem) => {
    setEditingModel(model);
    setCategory(model.category);
    setIsModalOpen(true);
  };

  const handleEditEmbedding = () => {
    if (embedding) {
      handleEditModel(embedding);
    } else {
      handleAddModel('embedding');
    }
  };

  const handleEditReranker = () => {
    if (reranker) {
      handleEditModel(reranker);
    } else {
      handleAddModel('reranker');
    }
  };

  const handleDeleteModel = (model: ProviderItem) => {
    beforeDeleteProviderItem(model);
  };

  const handleToggleEnabled = async (model: ProviderItem, enabled: boolean) => {
    const types = getDefaultModelTypes(model.itemId);
    if (!enabled && types.length) {
      disableDefaultModelConfirm(model.name, () => {
        updateModelMutation(enabled, model);
        updateDefaultModel(types, null);
      });
    } else {
      updateModelMutation(enabled, model);
    }
  };

  const handleSuccess = (
    categoryType: ProviderCategory,
    type?: 'create' | 'update',
    model?: ProviderItem,
  ) => {
    if (type === 'create') {
      if (categoryType === 'llm') {
        setModelItems((prev) => [...prev, model!]);
      } else if (categoryType === 'embedding') {
        setEmbedding(model!);
      } else if (categoryType === 'reranker') {
        setReranker(model!);
      } else if (categoryType === 'mediaGeneration') {
        setMediaGenerationModels((prev) => [...prev, model!]);
      }
    } else if (type === 'update') {
      if (categoryType === 'llm') {
        setModelItems((prev) =>
          prev.map((item) => (item.itemId === model!.itemId ? model! : item)),
        );
      } else if (categoryType === 'embedding') {
        setEmbedding(model!);
      } else if (categoryType === 'reranker') {
        setReranker(model!);
      } else if (categoryType === 'mediaGeneration') {
        setMediaGenerationModels((prev) =>
          prev.map((item) => (item.itemId === model!.itemId ? model! : item)),
        );
      }
    }
    setIsModalOpen(false);
    setEditingModel(null);

    // Emit event to refresh model list in other components
    modelEmitter.emit('model:list:refetch', null);
  };

  const filteredModels = useMemo(() => {
    const items = modelItems;

    if (!searchQuery.trim()) return items;

    const lowerQuery = searchQuery.toLowerCase();
    return items.filter((model) => model.name?.toLowerCase().includes(lowerQuery));
  }, [modelItems, searchQuery]);

  // Use the utility function instead of inline implementation
  const { handleGroupModelList } = useGroupModels();
  const sortedGroups = useMemo(() => handleGroupModelList(filteredModels), [filteredModels]);

  // When search query changes, update active collapse keys to show matching groups
  useEffect(() => {
    if (searchQuery.trim() && userHasInteracted) {
      const matchingGroupKeys = sortedGroups
        .filter((group) =>
          group.models.some((model) =>
            model.name?.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
        )
        .map((group) => group.key);

      setActiveCollapseKeys(matchingGroupKeys);
    }
  }, [searchQuery, sortedGroups, userHasInteracted]);

  // Update active keys when groups change (initial load)
  useEffect(() => {
    if (sortedGroups.length > 0 && !userHasInteracted) {
      setActiveCollapseKeys(sortedGroups.map((group) => group.key));
    }
  }, [sortedGroups, userHasInteracted]);

  useEffect(() => {
    if (visible) {
      getProviderItems();
    }
  }, [visible, getProviderItems]);

  // Handle collapse panel change
  const handleCollapseChange = (keys: string | string[]) => {
    setUserHasInteracted(true);
    setActiveCollapseKeys(typeof keys === 'string' ? [keys] : keys);
  };

  // Tab items for model categories
  const tabItems = [
    {
      key: 'conversation',
      label: t('settings.modelConfig.conversationModels'),
      icon: <LuMessageCircle className="h-4 w-4 flex items-center" />,
    },
    {
      key: 'media',
      label: t('settings.modelConfig.mediaGeneration'),
      icon: <LuImage className="h-4 w-4 flex items-center" />,
    },
    {
      key: 'other',
      label: t('settings.modelConfig.otherModels'),
      icon: <LuSettings className="h-4 w-4 flex items-center" />,
    },
  ];

  const renderConversationModels = () => (
    <>
      {/* Search and Add Bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative flex-1 max-w-xs">
          <Input
            prefix={<LuSearch className="h-4 w-4 text-gray-400" />}
            placeholder={t('settings.modelConfig.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Button
          type="primary"
          icon={<LuPlus className="h-5 w-5 flex items-center" />}
          onClick={() => handleAddModel('llm')}
        >
          {t('settings.modelConfig.addModel')}
        </Button>
      </div>

      {/* Models List */}
      <div
        className={cn(
          isLoading || filteredModels.length === 0 ? 'flex items-center justify-center' : '',
          filteredModels.length === 0
            ? 'p-4 border-dashed border-gray-200 dark:border-gray-600 rounded-md'
            : '',
          'min-h-[50px] overflow-y-auto',
        )}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-[300px]">
            <Spin />
          </div>
        ) : filteredModels.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              searchQuery ? (
                <>
                  <p>{t('settings.modelConfig.noSearchResults')}</p>
                  <p className="text-sm text-gray-400">
                    {t('settings.modelConfig.tryDifferentSearch')}
                  </p>
                </>
              ) : (
                <p>{t('settings.modelConfig.noModels')}</p>
              )
            }
          >
            {!searchQuery && (
              <Button
                onClick={() => handleAddModel('llm')}
                icon={<LuPlus className="flex items-center" />}
              >
                {t('settings.modelConfig.addFirstModel')}
              </Button>
            )}
          </Empty>
        ) : (
          <div className="mb-4 w-full">
            <Collapse
              size="small"
              activeKey={activeCollapseKeys}
              onChange={handleCollapseChange}
              bordered={false}
              className="bg-transparent"
              items={sortedGroups.map((group) => ({
                key: group.key,
                label: <span className="font-medium text-base">{group.name}</span>,
                style: panelStyle,
                children: group.models.map((model) => (
                  <ModelItem
                    key={model.itemId}
                    model={model}
                    onEdit={handleEditModel}
                    onDelete={handleDeleteModel}
                    onToggleEnabled={handleToggleEnabled}
                    isSubmitting={isUpdating}
                  />
                )),
              }))}
            />

            <div className="text-center text-gray-400 text-sm mt-4 pb-10">{t('common.noMore')}</div>
          </div>
        )}
      </div>
    </>
  );

  const renderMediaGenerationModels = () => (
    <>
      <div className="flex items-center justify-between mb-4">
        <Input
          placeholder={t('settings.modelConfig.searchPlaceholder')}
          prefix={<LuSearch className="h-4 w-4 text-gray-400" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <Button
          type="primary"
          icon={<LuPlus className="h-4 w-4" />}
          onClick={() => handleAddModel('mediaGeneration')}
        >
          {t('settings.modelConfig.addModel')}
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <Spin spinning={isLoading}>
          {mediaGenerationModels.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('settings.modelConfig.noMediaModels')}
            >
              <Button
                onClick={() => handleAddModel('mediaGeneration')}
                icon={<LuPlus className="flex items-center" />}
              >
                {t('settings.modelConfig.addFirstModel')}
              </Button>
            </Empty>
          ) : (
            <div className="space-y-2">
              {mediaGenerationModels.map((model) => (
                <ModelItem
                  key={model.itemId}
                  model={model}
                  onEdit={handleEditModel}
                  onDelete={handleDeleteModel}
                  onToggleEnabled={handleToggleEnabled}
                  isSubmitting={isUpdating}
                />
              ))}
            </div>
          )}
        </Spin>
      </div>
    </>
  );

  const renderOtherModels = () => (
    <>
      <div className="flex flex-col gap-4 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-medium">{t('settings.modelConfig.embedding')}</div>
            <div className="text-xs text-gray-500">
              {t('settings.modelConfig.embeddingDescription')}
            </div>
          </div>

          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => handleEditEmbedding()}
          >
            <Button
              type="text"
              icon={<IconEdit size={16} className="text-gray-700" />}
              iconPosition="end"
              className={cn(embedding?.name ? 'text-gray-500' : 'text-gray-400', 'text-sm')}
            >
              {embedding?.name || t('settings.modelConfig.clickToSet')}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-medium">{t('settings.modelConfig.reranker')}</div>
            <div className="text-xs text-gray-500">
              {t('settings.modelConfig.rerankerDescription')}
            </div>
          </div>

          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => handleEditReranker()}
          >
            <Button
              type="text"
              icon={<IconEdit size={16} className="text-gray-700" />}
              iconPosition="end"
              className={cn(reranker?.name ? 'text-gray-500' : 'text-gray-400', 'text-sm')}
            >
              {reranker?.name || t('settings.modelConfig.clickToSet')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'conversation':
        return renderConversationModels();
      case 'media':
        return renderMediaGenerationModels();
      case 'other':
        return renderOtherModels();
      default:
        return null;
    }
  };

  return (
    <div className="p-4 pt-0 h-full overflow-hidden flex flex-col">
      {/* Custom Tab Header */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 mb-4">
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
      <div className="flex-1 overflow-auto">{renderTabContent()}</div>

      {/* Modal for Create and Edit */}
      <ModelFormModal
        shouldRefetch={visible}
        isOpen={isModalOpen}
        filterProviderCategory={category}
        onClose={() => {
          setIsModalOpen(false);
          setEditingModel(null);
        }}
        disableDefaultModelConfirm={disableDefaultModelConfirm}
        model={editingModel}
        defaultModelTypes={getDefaultModelTypes(editingModel?.itemId)}
        onSuccess={handleSuccess}
        disabledEnableControl={['embedding', 'reranker'].includes(category)}
      />
    </div>
  );
};

ModelItem.displayName = 'ModelItem';
