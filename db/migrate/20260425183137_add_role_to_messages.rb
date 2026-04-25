class AddRoleToMessages < ActiveRecord::Migration[8.1]
  def change
    add_column :messages, :role, :string
  end
end
