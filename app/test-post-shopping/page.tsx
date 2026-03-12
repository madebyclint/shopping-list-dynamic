import PostShoppingPage from '@/app/components/PostShoppingPage';

export default function TestPostShopping() {
  return (
    <div className="app-layout">
      <div className="list-container">
        <div className="post-shopping-test">
          <h1>Test Post-Shopping Experience</h1>
          <PostShoppingPage groceryListId={12} />
        </div>
      </div>
    </div>
  );
}