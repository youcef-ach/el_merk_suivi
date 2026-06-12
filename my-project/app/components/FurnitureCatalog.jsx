import React, { useState, useEffect } from 'react';
import { searchSketchfab } from '../utils/sketchfabService';

const FurnitureCatalog = ({ onSelectFurniture, isPlacementMode }) => {
  const [localCatalog, setLocalCatalog] = useState([]);
  const [polyCatalog, setPolyCatalog] = useState([]);
  const [sketchfabCatalog, setSketchfabCatalog] = useState([]);
  
  const [source, setSource] = useState('Local');
  const [isOpen, setIsOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [isLoading, setIsLoading] = useState(false);

  // Sketchfab State
  const sfToken = '3efcf5e532454a1ebf575a17c52ad614';
  const [sfSearchQuery, setSfSearchQuery] = useState('modern sofa');
  const [sfCursor, setSfCursor] = useState(null);
  const [sfHasMore, setSfHasMore] = useState(false);

  useEffect(() => {
    fetch('/furniture/catalog.json')
      .then(res => res.json())
      .then(data => setLocalCatalog(data))
      .catch(err => console.error('Failed to load local furniture catalog:', err));
  }, []);

  useEffect(() => {
    if (source === 'Poly Haven' && polyCatalog.length === 0) {
      setIsLoading(true);
      fetch('https://api.polyhaven.com/assets?type=models')
        .then(res => res.json())
        .then(data => {
          const validCategories = ['furniture', 'seating', 'table', 'appliances', 'shelves', 'bed'];
          const models = Object.entries(data)
            .map(([id, info]) => {
              const cat = info.categories.find(c => validCategories.includes(c));
              return {
                isPolyHaven: true,
                id: id,
                name: info.name,
                category: cat || 'other',
                thumbnail: info.thumbnail_url,
                polyHavenId: id
              };
            })
            .filter(item => item.category !== 'other');
          setPolyCatalog(models);
        })
        .catch(err => console.error('Failed to load Poly Haven catalog:', err))
        .finally(() => setIsLoading(false));
    }
  }, [source, polyCatalog.length]);

  useEffect(() => {
    setActiveCategory('All');
  }, [source]);

  const handleSfSearch = async (loadMore = false) => {
    if (!sfToken) return;
    setIsLoading(true);
    try {
      const currentCursor = loadMore ? sfCursor : null;
      const data = await searchSketchfab(sfSearchQuery, sfToken, currentCursor);
      
      const newModels = data.results.map(model => ({
        isSketchfab: true,
        id: model.uid,
        name: model.name,
        category: 'sketchfab',
        thumbnail: model.thumbnails?.images?.[0]?.url || '',
        author: model.user?.username
      }));

      if (loadMore) {
        setSketchfabCatalog(prev => [...prev, ...newModels]);
      } else {
        setSketchfabCatalog(newModels);
      }
      
      setSfCursor(data.cursors?.next || null);
      setSfHasMore(!!data.cursors?.next);
      
    } catch (err) {
      console.error('Sketchfab search failed:', err);
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const currentCatalog = source === 'Local' ? localCatalog : source === 'Poly Haven' ? polyCatalog : sketchfabCatalog;
  const categories = source === 'Sketchfab' ? [] : ['All', ...new Set(currentCatalog.map(item => item.category))];
  const filteredCatalog = activeCategory === 'All' ? currentCatalog : currentCatalog.filter(item => item.category === activeCategory);

  return (
    <div className={`catalog-panel ${isOpen ? 'open' : 'closed'}`}>
      {isOpen && (
        <div className="catalog-content">
          {/* Header */}
          <div className="catalog-header">
            <h3 className="tool-section-title">Objects Catalog</h3>

            {/* Source Tabs */}
            <div className="catalog-source-tabs">
              {['Local', 'Poly Haven', 'Sketchfab'].map(s => (
                <button
                  key={s}
                  className={`catalog-source-tab ${source === s ? 'active' : ''}`}
                  onClick={() => setSource(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Sketchfab Search */}
          {source === 'Sketchfab' && (
            <div className="catalog-sf-panel">
              <div className="catalog-sf-search">
                <input 
                  type="text" 
                  value={sfSearchQuery}
                  onChange={e => setSfSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSfSearch(false)}
                  placeholder="Search models..."
                />
                <button className="catalog-sf-search-btn" onClick={() => handleSfSearch(false)}>Search</button>
              </div>
            </div>
          )}

          {/* Category Tabs */}
          {source !== 'Sketchfab' && categories.length > 1 && (
            <div className="catalog-category-tabs">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`catalog-category-tab ${activeCategory === cat ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Scrollable Items */}
          <div className="catalog-items">
            {isLoading && !sfCursor && (
              <div className="catalog-loading">Loading models...</div>
            )}

            {(!isLoading || sfCursor) && filteredCatalog.map(item => (
              <div key={item.id} className="catalog-card">
                {(item.isPolyHaven || item.isSketchfab || item.isLocalModel) ? (
                  <div className="catalog-card-preview">
                    <img
                      src={item.thumbnail}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="catalog-card-preview"
                    style={{ backgroundColor: item.color }}
                    title={`${item.name} (${item.type})`}
                  />
                )}

                <div className="catalog-card-info">
                  <div className="catalog-card-meta">
                    <span className="catalog-card-name">{item.name}</span>
                    {item.author && <span className="catalog-card-author">by {item.author}</span>}
                  </div>
                  <button
                    className={`catalog-place-btn ${isPlacementMode ? 'disabled' : ''}`}
                    onClick={() => onSelectFurniture(item)}
                    disabled={isPlacementMode}
                  >
                    Place
                  </button>
                </div>
              </div>
            ))}

            {source === 'Sketchfab' && sfHasMore && (
              <button 
                className="catalog-load-more"
                onClick={() => handleSfSearch(true)}
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FurnitureCatalog;
